// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const lintComponent = async (source: string) => {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(source, { filePath: 'src/LintFixture.tsx' });
  return result.messages.filter((message) => message.ruleId === 'i18next/no-literal-string');
};

describe('no-literal-string lint rule', () => {
  it('given hard-coded JSX text and a user-facing attribute, when linting, then reports both', async () => {
    const messages = await lintComponent(
      'export const Widget = () => <button aria-label="Close">Save</button>;\n',
    );

    expect(messages).toHaveLength(2);
  });

  it('given dictionary text, symbols and technical attributes, when linting, then reports nothing', async () => {
    const messages = await lintComponent(
      'export const Widget = ({ label }: { label: string }) => (\n'
        + '  <a href="/admin" className="p-2" data-testid="link">{label} · 42%</a>\n'
        + ');\n',
    );

    expect(messages).toHaveLength(0);
  });
});
