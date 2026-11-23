// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// The guard of RTL readiness (I-09, #113): `mktba/logical-direction` in eslint.config.js.
// Building the ESLint loads the config and plugins (the slow part), so one serves the whole file.
const eslint = new ESLint();
const LINT_TIMEOUT_MS = 60_000;

const lint = async (source: string, filePath = 'src/LintFixture.tsx') => {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter((message) => message.ruleId === 'mktba/logical-direction');
};

const tokens = (messages: Awaited<ReturnType<typeof lint>>) =>
  messages.map((message) => /^"([^"]+)"/.exec(message.message)?.[1] ?? message.message);

describe('logical direction lint rule', { timeout: LINT_TIMEOUT_MS }, () => {
  it('given physical direction utilities in class strings, when linting, then reports each of them', async () => {
    const messages = await lint(
      'export const Widget = ({ on }: { on: boolean }) => (\n'
        + '  <div className="ml-2 pr-4 md:text-left border-r rounded-tl-lg -left-6 hover:right-0 lg:float-right!">\n'
        + "    <span className={on ? 'translate-x-4' : 'pl-3'} />\n"
        + '  </div>\n'
        + ');\n',
    );

    expect(tokens(messages)).toEqual(['ml-2', 'pr-4', 'md:text-left', 'border-r', 'rounded-tl-lg', '-left-6', 'hover:right-0', 'lg:float-right!', 'translate-x-4', 'pl-3']);
  });

  it('given logical utilities, explicit ltr:/rtl: values and a mirrored translate, when linting, then reports nothing', async () => {
    const messages = await lint(
      'export const Widget = ({ on }: { on: boolean }) => (\n'
        + '  <div className="ms-2 pe-4 text-start border-e rounded-ss-lg -inset-s-6 inset-e-0 float-end ltr:ml-1 rtl:mr-1 space-x-2 px-3">\n'
        + "    <span className={on ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0'} />\n"
        + '    <p>right-to-left text and the left side</p>\n'
        + '  </div>\n'
        + ');\n',
    );

    expect(messages).toEqual([]);
  });

  it('given physical inline-style properties, when linting, then reports them and accepts the logical ones', async () => {
    const physical = await lint(
      "export const style = { marginLeft: 4, paddingRight: '1rem', textAlign: 'right' as const };\n",
      'src/lintFixture.ts',
    );
    const logical = await lint(
      "export const style = { marginInlineStart: 4, paddingInlineEnd: '1rem', textAlign: 'start' as const, left: 0 };\n",
      'src/lintFixture.ts',
    );

    expect(physical).toHaveLength(3);
    expect(logical).toEqual([]);
  });

  it('given a justified exception with a disable comment or a test file, when linting, then reports nothing', async () => {
    const disabled = await lint(
      '// eslint-disable-next-line mktba/logical-direction -- fixture: a physical side on purpose\n'
        + "export const className = 'pl-2';\n",
      'src/lintFixture.ts',
    );
    const test = await lint("export const expected = 'pl-2';\n", 'src/lintFixture.test.ts');

    expect(disabled).toEqual([]);
    expect(test).toEqual([]);
  });
});
