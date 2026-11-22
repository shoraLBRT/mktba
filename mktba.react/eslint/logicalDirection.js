/**
 * RTL readiness (I-09, #113): layout uses logical directions — `ms-*`/`pe-*`, `inset-s-*`/`inset-e-*`,
 * `text-start`, `border-s`, `rounded-e` — so the page mirrors under `dir="rtl"` by itself. This rule
 * reports the physical Tailwind utilities (and inline-style properties) that would stay put.
 *
 * Allowed without comment:
 * - a physical utility under an explicit `ltr:`/`rtl:` variant — that is a deliberate per-direction value;
 * - `translate-x-*` in a string that also carries an `rtl:` translate — the mirrored counterpart
 *   (translate has no logical form);
 * - the tokens in the `allow` option.
 * Anything else that must stay physical gets `// eslint-disable-next-line mktba/logical-direction -- <why>`.
 */

// A class token: optional variants (`md:`, `hover:`…), optional `!`/`-`, then the utility.
const PHYSICAL = /^(?:-?(?:m[lr]|p[lr]|scroll-[mp][lr]|left|right)-.+|text-(?:left|right)|float-(?:left|right)|clear-(?:left|right)|border-[lr](?:-.+)?|rounded-(?:[lr]|tl|tr|bl|br)(?:-.+)?)$/;
// `translate-x-0` moves nothing, so it has no direction.
const TRANSLATE_X = /^-?translate-x-(?!0$).+$/;
const DIRECTION_VARIANT = /(?:^|:)(?:ltr|rtl):/;

const STYLE_PROPERTIES = /^(?:margin|padding|border)(?:Left|Right)(?:Width|Color|Style)?$|^border(?:Top|Bottom)(?:Left|Right)Radius$/;
const PHYSICAL_TEXT_ALIGN = /^(?:left|right)$/;

const splitToken = (token) => {
  const lastColon = token.lastIndexOf(':');
  const variants = lastColon === -1 ? '' : token.slice(0, lastColon + 1);
  const utility = token.slice(lastColon + 1).replace(/^!/, '').replace(/!$/, '');
  return { variants, utility };
};

const physicalTokens = (value, allow) => {
  const tokens = value.split(/\s+/).filter(Boolean);
  const mirroredTranslate = tokens.some((token) => {
    const { variants, utility } = splitToken(token);
    return /(?:^|:)rtl:/.test(variants) && TRANSLATE_X.test(utility);
  });

  return tokens.filter((token) => {
    if (allow.has(token)) {
      return false;
    }

    const { variants, utility } = splitToken(token);
    if (DIRECTION_VARIANT.test(variants)) {
      return false;
    }

    return PHYSICAL.test(utility) || (TRANSLATE_X.test(utility) && !mirroredTranslate);
  });
};

const logicalDirection = {
  meta: {
    type: 'problem',
    docs: { description: 'Use logical (start/end) direction utilities so the layout mirrors under dir="rtl".' },
    schema: [{
      type: 'object',
      properties: { allow: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    }],
    messages: {
      physical: '"{{token}}" is a physical direction; use the logical one (ms/me, ps/pe, inset-s/e, text-start/end, border-s/e, rounded-s/e) or an ltr:/rtl: pair, so the layout mirrors in RTL (#113).',
      style: 'Inline style "{{name}}" is a physical direction; use its logical form (marginInlineStart, paddingInlineEnd, textAlign: start…) (#113).',
    },
  },
  create(context) {
    const allow = new Set(context.options[0]?.allow ?? []);

    const check = (node, value) => {
      for (const token of physicalTokens(value, allow)) {
        context.report({ node, messageId: 'physical', data: { token } });
      }
    };

    return {
      Literal(node) {
        // An import path or an object key is not a class list.
        const isKey = node.parent?.type === 'Property' && node.parent.key === node;
        if (typeof node.value === 'string' && node.parent?.type !== 'ImportDeclaration' && !isKey) {
          check(node, node.value);
        }
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
      Property(node) {
        const name = node.key.type === 'Identifier' ? node.key.name : node.key.value;
        if (typeof name !== 'string') {
          return;
        }

        let value = node.value;
        while (value.type === 'TSAsExpression' || value.type === 'TSSatisfiesExpression') {
          value = value.expression;
        }

        if (STYLE_PROPERTIES.test(name)) {
          context.report({ node: node.key, messageId: 'style', data: { name } });
        } else if (name === 'textAlign' && value.type === 'Literal' && PHYSICAL_TEXT_ALIGN.test(String(value.value))) {
          context.report({ node: value, messageId: 'style', data: { name: `textAlign: ${value.value}` } });
        }
      },
    };
  },
};

export default { rules: { 'logical-direction': logicalDirection } };
