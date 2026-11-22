// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// One ESLint for the file: building it loads the config and plugins, the slow part. Linting is
// CPU-bound and has nothing to wait for, so the generous timeout only covers a loaded machine
// (a full parallel `npm test`), where the default 5 s was seen to run out.
const eslint = new ESLint();
const LINT_TIMEOUT_MS = 60_000;

const RULES = ['i18next/no-literal-string', 'no-restricted-syntax'];

const lint = async (source: string, filePath = 'src/LintFixture.tsx') => {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter((message) => message.ruleId !== null && RULES.includes(message.ruleId));
};

describe('hard-coded UI text lint rules', { timeout: LINT_TIMEOUT_MS }, () => {
  it('given hard-coded JSX text and a user-facing attribute, when linting, then reports both', async () => {
    const messages = await lint('export const Widget = () => <button aria-label="Close">Save</button>;\n');

    expect(messages.map((message) => message.ruleId)).toEqual(['i18next/no-literal-string', 'i18next/no-literal-string']);
  });

  it('given dictionary text, symbols and technical attributes, when linting, then reports nothing', async () => {
    const messages = await lint(
      'export const Widget = ({ label }: { label: string }) => (\n'
        + '  <a href="/admin" className="p-2" data-testid="link">{label} · 42%</a>\n'
        + ');\n',
    );

    expect(messages).toEqual([]);
  });

  it('given Russian text outside JSX, when linting, then reports a string, a template and a .ts module', async () => {
    const component = await lint(
      "const labels = { save: 'Сохранить' };\n"
        + 'export const notice = (n: number) => `Удалено: ${n}`;\n'
        + 'export const Widget = () => <button aria-label={labels.save} />;\n',
    );
    const module = await lint("export const aliases = ['абзац'];\n", 'src/lintFixture.ts');

    expect(component.map((message) => message.ruleId)).toEqual(['no-restricted-syntax', 'no-restricted-syntax']);
    expect(module.map((message) => message.ruleId)).toEqual(['no-restricted-syntax']);
  });

  it('given Russian text in a comment or a test file, when linting, then reports nothing', async () => {
    const comment = await lint("// Подпись берётся из словаря.\nexport const key = 'save';\n", 'src/lintFixture.ts');
    const test = await lint("export const expected = 'Сохранить';\n", 'src/lintFixture.test.ts');

    expect(comment).toEqual([]);
    expect(test).toEqual([]);
  });
});
