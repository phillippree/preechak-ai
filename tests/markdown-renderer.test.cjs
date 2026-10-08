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

test('renders Mermaid fences as a diagram placeholder with readable source', async () => {
    const { renderMarkdown } = await loadRenderer();
    const diagram = `flowchart TD
    Client --> API
    API --> Database`;
    const html = renderMarkdown(`\`\`\`mermaid\n${diagram}\n\`\`\``);

    assert.ok(html.includes('class="mermaid-diagram"'));
    assert.ok(html.includes('data-mermaid-source="' + encodeURIComponent(diagram) + '"'));
    assert.ok(html.includes('View Mermaid source'));
    assert.ok(html.includes('Client --&gt; API'));
    assert.ok(!html.includes('code-block-copy-btn'));
});

test('renders Mermaid SVG and applies strict security configuration', async () => {
    const { renderMermaidDiagrams } = await loadRenderer();
    const originalMermaid = globalThis.mermaid;
    const calls = [];
    const target = { innerHTML: '' };
    const attrs = { 'data-mermaid-source': encodeURIComponent('flowchart TD\nA --> B') };
    const diagram = {
        classList: { add(name) { calls.push(['class', name]); } },
        getAttribute(name) { return attrs[name] || null; },
        setAttribute(name, value) { attrs[name] = value; },
        querySelector() { return target; },
    };
    globalThis.mermaid = {
        initialize(config) { calls.push(['initialize', config]); },
        async render(id, source) {
            calls.push(['render', id, source]);
            return { svg: '<svg aria-label="diagram"></svg>' };
        },
    };

    try {
        assert.equal(await renderMermaidDiagrams({ querySelectorAll: () => [diagram] }), true);
        assert.equal(target.innerHTML, '<svg aria-label="diagram"></svg>');
        assert.equal(attrs['data-render-state'], 'rendered');
        assert.equal(calls[0][1].securityLevel, 'strict');
        assert.equal(calls[1][2], 'flowchart TD\nA --> B');
    } finally {
        if (originalMermaid === undefined) delete globalThis.mermaid;
        else globalThis.mermaid = originalMermaid;
    }
});

test('keeps Mermaid source available when diagram parsing fails', async () => {
    const { renderMermaidDiagrams } = await loadRenderer();
    const originalMermaid = globalThis.mermaid;
    const target = { textContent: '' };
    const attrs = { 'data-mermaid-source': encodeURIComponent('not a diagram') };
    const classes = [];
    const diagram = {
        classList: { add(name) { classes.push(name); } },
        getAttribute(name) { return attrs[name] || null; },
        setAttribute(name, value) { attrs[name] = value; },
        querySelector() { return target; },
    };
    globalThis.mermaid = { initialize() {}, async render() { throw new Error('parse error'); } };

    try {
        await renderMermaidDiagrams({ querySelectorAll: () => [diagram] });
        assert.equal(attrs['data-render-state'], 'error');
        assert.ok(classes.includes('mermaid-render-error'));
        assert.match(target.textContent, /View Mermaid source/);
    } finally {
        if (originalMermaid === undefined) delete globalThis.mermaid;
        else globalThis.mermaid = originalMermaid;
    }
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
    assert.ok(cssContent.includes('.math-inline'), 'Styles should include .math-inline');
    assert.ok(cssContent.includes('.math-block'), 'Styles should include .math-block');
});

test('renders LaTeX math expressions into human-readable symbols and HTML', async () => {
    const { renderMarkdown, convertLatexExpression } = await loadRenderer();

    // 1. Direct symbol & expression unit conversions
    assert.equal(convertLatexExpression('\\approx 1.37\\text{ bytes}'), '≈ 1.37 bytes');
    assert.equal(convertLatexExpression('\\sim 5{,}000\\text{ QPS}'), '~ 5,000 QPS');
    assert.equal(convertLatexExpression('3\\times'), '3×');
    assert.equal(convertLatexExpression('P_{95} < 200\\text{ms}'), 'P<sub>95</sub> < 200ms');
    assert.equal(convertLatexExpression('10^{6}'), '10<sup>6</sup>');
    assert.equal(convertLatexExpression('\\alpha + \\beta \\le \\gamma'), 'α + β ≤ γ');
    assert.equal(convertLatexExpression('\\frac{10}{2} = 5'), '(10 / 2) = 5');
    assert.equal(convertLatexExpression('\\sqrt{16} = 4'), '√(16) = 4');

    // 2. Full markdown string with user example
    const inputMd = `### Back-of-the-Envelope Calculations
Timestamp compression: $\\approx 1.37\\text{ bytes}$.
Value compression: $\\approx 1.5\\text{ bytes}$.
Scale: $10\\text{M}$ metrics emitted/sec. Read QPS: $\\sim 5{,}000\\text{ QPS}$.
Latency: $< 10\\text{s}$; query execution $P_{95} < 200\\text{ms}$.
Lifecycle: (raw $\\rightarrow$ 1m $\\rightarrow$ 1h $\\rightarrow$ 1d).
30-day retention with $3\\times$ replication: $12.96\\text{ TB} \\times 30 \\times 3 \\approx 1.16\\text{ PB}$.`;

    const html = renderMarkdown(inputMd);

    // Verify symbols replaced raw text
    assert.ok(html.includes('≈ 1.37 bytes'));
    assert.ok(html.includes('≈ 1.5 bytes'));
    assert.ok(html.includes('10M'));
    assert.ok(html.includes('~ 5,000 QPS'));
    assert.ok(html.includes('P<sub>95</sub>'));
    assert.ok(html.includes('→'));
    assert.ok(html.includes('3×'));
    assert.ok(html.includes('12.96 TB × 30 × 3 ≈ 1.16 PB'));
    assert.ok(html.includes('class="math-inline"'));

    // Verify raw backslashes are no longer visible in output
    assert.ok(!html.includes('\\approx'));
    assert.ok(!html.includes('\\text{'));
    assert.ok(!html.includes('\\sim'));
    assert.ok(!html.includes('\\rightarrow'));
    assert.ok(!html.includes('{,}'));
});

test('renders block math $$ ... $$ and preserves code blocks without modifying code', async () => {
    const { renderMarkdown } = await loadRenderer();

    const blockMathMd = `Here is the formula:
$$E = mc^2$$`;
    const blockHtml = renderMarkdown(blockMathMd);
    assert.ok(blockHtml.includes('class="math-block"'));
    assert.ok(blockHtml.includes('E = mc<sup>2</sup>'));

    // Code block with $ signs must not be corrupted
    const codeSnippet = `\`\`\`bash
# Bash script using variables
VAR="test"
echo "$VAR and $\\approx 100"
\`\`\``;
    const codeHtml = renderMarkdown(codeSnippet);
    assert.ok(codeHtml.includes('class="code-block-wrapper"'));
    assert.ok(codeHtml.includes('$VAR'));
    assert.ok(codeHtml.includes('$\\approx 100'));
});
