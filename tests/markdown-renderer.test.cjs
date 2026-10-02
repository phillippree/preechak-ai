const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

if (!globalThis.window) {
    globalThis.window = globalThis;
}

// Initialize marked and hljs in global scope for testing environment
if (!globalThis.marked || !globalThis.hljs) {
    const markedPath = path.join(__dirname, '../src/assets/marked-4.3.0.min.js');
    const hljsPath = path.join(__dirname, '../src/assets/highlight-11.9.0.min.js');

    if (fs.existsSync(markedPath)) {
        const markedCode = fs.readFileSync(markedPath, 'utf8');
        const sandbox = { globalThis, exports: {}, module: { exports: {} } };
        vm.createContext(sandbox);
        vm.runInContext(markedCode, sandbox);
        globalThis.marked = sandbox.marked || sandbox.exports || sandbox.module.exports;
    }

    if (fs.existsSync(hljsPath)) {
        const hljsCode = fs.readFileSync(hljsPath, 'utf8');
        const sandbox = { globalThis, exports: {}, module: { exports: {} } };
        vm.createContext(sandbox);
        vm.runInContext(hljsCode, sandbox);
        globalThis.hljs = sandbox.hljs || sandbox.exports || sandbox.module.exports;
    }
}

const loadRenderer = async () => await import('../src/utils/markdownRenderer.js');

test('resolves language aliases and formats display names', async () => {
    const { resolveLanguage, formatLanguageName } = await loadRenderer();
    assert.equal(resolveLanguage('py'), 'python');
    assert.equal(resolveLanguage('js'), 'javascript');
    assert.equal(resolveLanguage('ts'), 'typescript');
    assert.equal(resolveLanguage('sh'), 'bash');
    assert.equal(resolveLanguage('c++'), 'cpp');
    assert.equal(resolveLanguage('c#'), 'csharp');
    assert.equal(resolveLanguage('html'), 'xml');
    assert.equal(resolveLanguage('yml'), 'yaml');

    assert.equal(formatLanguageName('python'), 'Python');
    assert.equal(formatLanguageName('js'), 'JavaScript');
    assert.equal(formatLanguageName('ts'), 'TypeScript');
    assert.equal(formatLanguageName('cpp'), 'C++');
    assert.equal(formatLanguageName(''), 'Code');
});

test('highlights Python code with syntax tokens and code wrapper', async () => {
    const { renderMarkdown } = await loadRenderer();
    const pythonSnippet = `\`\`\`python
def two_sum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []
\`\`\``;

    const html = renderMarkdown(pythonSnippet);
    assert.ok(html.includes('class="code-block-wrapper"'));
    assert.ok(html.includes('data-language="python"'));
    assert.ok(html.includes('<span class="code-block-lang">Python</span>'));
    assert.ok(html.includes('class="code-block-copy-btn"'));
    assert.ok(html.includes('class="hljs language-python"'));
    // Should have syntax highlighted tokens
    assert.ok(html.includes('hljs-keyword'));
    assert.ok(html.includes('hljs-title'));
});

test('highlights JavaScript code with syntax tokens and preserves indentation', async () => {
    const { renderMarkdown } = await loadRenderer();
    const jsSnippet = `\`\`\`javascript
function calculateSum(a, b) {
    // Return total
    return a + b;
}
\`\`\``;

    const html = renderMarkdown(jsSnippet);
    assert.ok(html.includes('data-language="javascript"'));
    assert.ok(html.includes('<span class="code-block-lang">JavaScript</span>'));
    assert.ok(html.includes('class="hljs language-javascript"'));
    assert.ok(html.includes('hljs-keyword'));
    assert.ok(html.includes('hljs-comment'));
});

test('handles unsupported or missing language tags gracefully with plain code fallback', async () => {
    const { renderMarkdown } = await loadRenderer();
    const customCode = `\`\`\`unknownlang
CUSTOM_INSTRUCTION @ 0x1234 -> R1
\`\`\``;

    const html = renderMarkdown(customCode);
    assert.ok(html.includes('class="code-block-wrapper"'));
    assert.ok(html.includes('language-plaintext'));
    assert.ok(html.includes('CUSTOM_INSTRUCTION @ 0x1234 -&gt; R1'));

    const noLangCode = `\`\`\`
plain text code block
\`\`\``;
    const noLangHtml = renderMarkdown(noLangCode);
    assert.ok(noLangHtml.includes('<span class="code-block-lang">Code</span>'));
    assert.ok(noLangHtml.includes('plain text code block'));
});

test('preserves exact code and indentation in data-code attribute for copying', async () => {
    const { renderMarkdown } = await loadRenderer();
    const rawCode = `    def indented_function():
        x = [1, 2, 3]
        "quote ' test"
        return x`;

    const markdown = `\`\`\`python\n${rawCode}\n\`\`\``;
    const html = renderMarkdown(markdown);

    const match = html.match(/data-code="([^"]+)"/);
    assert.ok(match, 'data-code attribute must exist');
    const decoded = decodeURIComponent(match[1]);
    assert.equal(decoded, rawCode, 'Decoded copy text must match original code exactly');
});

test('renders Markdown headings, lists, bold text, inline code, links, and blockquotes', async () => {
    const { renderMarkdown } = await loadRenderer();
    const md = `### Strategy Plan
- **Step 1:** Analyze input \`x\`
- **Step 2:** Compute [Documentation](https://example.com/docs)
> Important note: check boundary conditions`;

    const html = renderMarkdown(md);
    assert.ok(html.includes('<h3>Strategy Plan</h3>'));
    assert.ok(html.includes('<strong>Step 1:</strong>'));
    assert.ok(html.includes('<code>x</code>'));
    assert.ok(html.includes('href="https://example.com/docs"'));
    assert.ok(html.includes('target="_blank"'));
    assert.ok(html.includes('rel="noopener noreferrer"'));
    assert.ok(html.includes('<blockquote>'));
    assert.ok(html.includes('Important note: check boundary conditions'));
});

test('sanitizes malicious HTML and unsafe link schemes', async () => {
    const { renderMarkdown } = await loadRenderer();
    const maliciousMd = `<script>alert("hack")</script>
<img src="x" onerror="stealData()" />
<a href="javascript:alert(1)">Click me</a>
<iframe src="https://evil.com"></iframe>`;

    const html = renderMarkdown(maliciousMd);
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('alert("hack")'));
    assert.ok(!html.includes('onerror='));
    assert.ok(!html.includes('stealData()'));
    assert.ok(!html.includes('href="javascript:'));
    assert.ok(!html.includes('<iframe'));
});

test('displays HTML examples inside code blocks safely as text', async () => {
    const { renderMarkdown } = await loadRenderer();
    const codeWithHtml = `\`\`\`html
<div class="user-profile" onclick="doSomething()">
    <h1>Hello World</h1>
</div>
\`\`\``;

    const html = renderMarkdown(codeWithHtml);
    assert.ok(html.includes('class="code-block-wrapper"'));
    // The HTML tags should be rendered as code tokens/escaped entities, not active DOM elements
    assert.ok(html.includes('hljs-name">div</span>'));
    assert.ok(html.includes('hljs-name">h1</span>'));
    assert.ok(html.includes('&lt;'));
    assert.ok(!html.includes('<div class="user-profile"'));
});

test('handles incomplete streamed code blocks without crashing', async () => {
    const { renderMarkdown, completeStreamMarkdown } = await loadRenderer();
    const incompleteStream = `### Plan
\`\`\`python
def stream_function():
    return True`;

    // stream auto-completer should balance fences
    const completed = completeStreamMarkdown(incompleteStream);
    assert.ok(completed.endsWith('\n```'));

    const html = renderMarkdown(incompleteStream);
    assert.ok(html.includes('class="code-block-wrapper"'));
    assert.ok(html.includes('stream_function'));
    assert.ok(html.includes('hljs-keyword'));
});

test('markdownStyles configures word wrapping and prevents horizontal overflow for code blocks', () => {
    const stylesPath = path.join(__dirname, '../src/components/views/markdownStyles.js');
    const cssContent = fs.readFileSync(stylesPath, 'utf8');

    assert.ok(cssContent.includes('white-space: pre-wrap;'), 'Code block should have pre-wrap');
    assert.ok(cssContent.includes('word-break: break-word;'), 'Code block should have word-break');
    assert.ok(cssContent.includes('overflow-wrap: anywhere;'), 'Code block should have overflow-wrap: anywhere');
    assert.ok(cssContent.includes('overflow-x: hidden;'), 'Code block pre should have overflow-x: hidden');
    assert.ok(cssContent.includes('background: var(--bg-elevated'), 'Code block wrapper should use dynamic bg-elevated variable');
});
