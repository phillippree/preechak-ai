/**
 * Shared Markdown and Code Renderer for Preechak AI.
 * Handles syntax highlighting with highlight.js, editor-style code blocks with copy controls,
 * and robust HTML sanitization for assistant responses and history views.
 */

// Helper to resolve marked and hljs in browser, Electron, and Node environments
function getDependencies() {
    let markedInstance = null;
    let hljsInstance = null;

    if (typeof globalThis !== 'undefined') {
        if (globalThis.marked) markedInstance = globalThis.marked;
        if (globalThis.hljs) hljsInstance = globalThis.hljs;
    }

    if (!markedInstance && typeof window !== 'undefined' && window.marked) {
        markedInstance = window.marked;
    }
    if (!hljsInstance && typeof window !== 'undefined' && window.hljs) {
        hljsInstance = window.hljs;
    }

    if (!markedInstance && typeof global !== 'undefined' && global.marked) {
        markedInstance = global.marked;
    }
    if (!hljsInstance && typeof global !== 'undefined' && global.hljs) {
        hljsInstance = global.hljs;
    }

    return { marked: markedInstance, hljs: hljsInstance };
}

const LANGUAGE_ALIASES = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    py: 'python',
    py3: 'python',
    python3: 'python',
    rb: 'ruby',
    ruby: 'ruby',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    shell: 'shell',
    html: 'xml',
    xhtml: 'xml',
    xml: 'xml',
    svg: 'xml',
    'c++': 'cpp',
    cpp: 'cpp',
    'c#': 'csharp',
    cs: 'csharp',
    csharp: 'csharp',
    yml: 'yaml',
    yaml: 'yaml',
    md: 'markdown',
    markdown: 'markdown',
    json: 'json',
    sql: 'sql',
    rust: 'rust',
    rs: 'rust',
    golang: 'go',
    go: 'go',
    css: 'css',
    scss: 'scss',
    less: 'less',
    java: 'java',
    kt: 'kotlin',
    kotlin: 'kotlin',
    swift: 'swift',
    php: 'php',
    diff: 'diff',
    graphql: 'graphql',
    gql: 'graphql',
    ini: 'ini',
    toml: 'ini',
    txt: 'plaintext',
    text: 'plaintext',
};

function escapeHtml(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function resolveLanguage(lang) {
    if (!lang || typeof lang !== 'string') return '';
    const clean = lang.trim().toLowerCase().split(/\s+/)[0];
    return LANGUAGE_ALIASES[clean] || clean;
}

function formatLanguageName(lang) {
    if (!lang) return 'Code';
    const resolved = resolveLanguage(lang);
    const displayNames = {
        javascript: 'JavaScript',
        typescript: 'TypeScript',
        python: 'Python',
        cpp: 'C++',
        csharp: 'C#',
        xml: 'HTML/XML',
        html: 'HTML',
        json: 'JSON',
        sql: 'SQL',
        bash: 'Bash',
        shell: 'Shell',
        yaml: 'YAML',
        css: 'CSS',
        scss: 'SCSS',
        markdown: 'Markdown',
        rust: 'Rust',
        go: 'Go',
        java: 'Java',
        kotlin: 'Kotlin',
        swift: 'Swift',
        php: 'PHP',
        diff: 'Diff',
        graphql: 'GraphQL',
        plaintext: 'Plain Text',
    };
    return displayNames[resolved] || lang.toUpperCase();
}

/**
 * Custom code block renderer for Marked producing IDE-style snippet wrappers.
 */
function renderMermaidBlock(code) {
    const encodedSource = encodeURIComponent(code);
    return `<div class="mermaid-diagram" data-mermaid-source="${encodedSource}" role="group" aria-label="Mermaid diagram">
  <div class="mermaid-render-target" role="img" aria-label="Rendered architecture diagram"></div>
  <details class="mermaid-source">
    <summary>View Mermaid source</summary>
    <pre><code>${escapeHtml(code)}</code></pre>
  </details>
</div>`;
}

function renderCodeBlock(code, language, hljs) {
    const resolvedLang = resolveLanguage(language);
    if (resolvedLang === 'mermaid') return renderMermaidBlock(code);
    let highlightedHtml = '';
    let isHighlighted = false;

    if (hljs && resolvedLang && hljs.getLanguage && hljs.getLanguage(resolvedLang)) {
        try {
            const result = hljs.highlight(code, { language: resolvedLang, ignoreIllegals: true });
            highlightedHtml = result.value;
            isHighlighted = true;
        } catch (e) {
            highlightedHtml = escapeHtml(code);
        }
    } else {
        highlightedHtml = escapeHtml(code);
    }

    const displayLang = formatLanguageName(language);
    const encodedCode = encodeURIComponent(code);
    const langClass = isHighlighted ? `hljs language-${resolvedLang}` : 'hljs language-plaintext';

    return `<div class="code-block-wrapper" data-language="${escapeHtml(resolvedLang || 'plaintext')}">
  <div class="code-block-header">
    <span class="code-block-lang">${escapeHtml(displayLang)}</span>
    <button class="code-block-copy-btn" type="button" aria-label="Copy code" data-code="${encodedCode}">
      <svg class="copy-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <svg class="check-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span class="copy-text">Copy code</span>
    </button>
  </div>
  <pre class="code-block-pre"><code class="${langClass}">${highlightedHtml}</code></pre>
</div>`;
}

/**
 * Sanitize rendered HTML to block executable scripts, event handlers, and unsafe URL schemes.
 */
function sanitizeHtml(rawHtml) {
    if (!rawHtml || typeof rawHtml !== 'string') return '';

    // Fast path: if DOMParser is available (browser/Electron environment)
    if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<body>${rawHtml}</body>`, 'text/html');

        const disallowedTags = new Set([
            'SCRIPT',
            'IFRAME',
            'OBJECT',
            'EMBED',
            'APPLET',
            'FRAME',
            'FRAMESET',
            'META',
            'LINK',
            'STYLE',
            'FORM',
            'INPUT',
            'SELECT',
        ]);

        // Remove dangerous elements
        const allElements = doc.body.querySelectorAll('*');
        allElements.forEach(el => {
            if (disallowedTags.has(el.tagName)) {
                el.remove();
                return;
            }

            // Remove all inline event handlers (on*)
            const attrs = Array.from(el.attributes);
            for (const attr of attrs) {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                }
            }

            // Validate links
            if (el.tagName === 'A') {
                const href = (el.getAttribute('href') || '').trim();
                const isSafeProtocol = /^(https?:\/\/|mailto:|#|\/)/i.test(href);
                if (!isSafeProtocol) {
                    el.removeAttribute('href');
                } else {
                    el.setAttribute('target', '_blank');
                    el.setAttribute('rel', 'noopener noreferrer');
                }
            }

            // Validate image sources
            if (el.tagName === 'IMG') {
                const src = (el.getAttribute('src') || '').trim();
                const isSafeSrc = /^(https?:\/\/|data:image\/|file:\/\/)/i.test(src);
                if (!isSafeSrc) {
                    el.removeAttribute('src');
                }
            }
        });

        return doc.body.innerHTML;
    }

    // Fallback regex-based sanitizer for Node test contexts
    let sanitized = rawHtml
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
        .replace(/<embed\b[^>]*>/gi, '')
        .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/href\s*=\s*["']?\s*(?:javascript|vbscript|data(?!:image\/)):[^"'>\s]*/gi, 'href="#"');

    return sanitized;
}

const LATEX_SYMBOLS = {
    // Relations & Arrows
    '\\approx': '≈',
    '\\approxeq': '≅',
    '\\sim': '~',
    '\\simeq': '≃',
    '\\cong': '≅',
    '\\equiv': '≡',
    '\\ne': '≠',
    '\\neq': '≠',
    '\\le': '≤',
    '\\leq': '≤',
    '\\ge': '≥',
    '\\geq': '≥',
    '\\ll': '≪',
    '\\gg': '≫',
    '\\rightarrow': '→',
    '\\to': '→',
    '\\leftarrow': '←',
    '\\gets': '←',
    '\\leftrightarrow': '↔',
    '\\Rightarrow': '⇒',
    '\\implies': '⇒',
    '\\Leftarrow': '⇐',
    '\\Leftrightarrow': '⇔',
    '\\iff': '⇔',
    '\\mapsto': '↦',
    '\\uparrow': '↑',
    '\\downarrow': '↓',

    // Operators & Arithmetic
    '\\times': '×',
    '\\div': '÷',
    '\\pm': '±',
    '\\mp': '∓',
    '\\cdot': '·',
    '\\bullet': '•',
    '\\circ': '°',
    '\\deg': '°',
    '\\infty': '∞',
    '\\partial': '∂',
    '\\nabla': '∇',
    '\\sum': '∑',
    '\\prod': '∏',
    '\\int': '∫',
    '\\oint': '∮',
    '\\propto': '∝',
    '\\in': '∈',
    '\\notin': '∉',
    '\\subset': '⊂',
    '\\subseteq': '⊆',
    '\\supset': '⊃',
    '\\supseteq': '⊇',
    '\\cup': '∪',
    '\\cap': '∩',
    '\\forall': '∀',
    '\\exists': '∃',
    '\\nexists': '∄',
    '\\empty': '∅',
    '\\emptyset': '∅',
    '\\land': '∧',
    '\\lor': '∨',
    '\\neg': '¬',

    // Greek Alphabet (Lower)
    '\\alpha': 'α',
    '\\beta': 'β',
    '\\gamma': 'γ',
    '\\delta': 'δ',
    '\\epsilon': 'ε',
    '\\varepsilon': 'ε',
    '\\zeta': 'ζ',
    '\\eta': 'η',
    '\\theta': 'θ',
    '\\vartheta': 'θ',
    '\\iota': 'ι',
    '\\kappa': 'κ',
    '\\lambda': 'λ',
    '\\mu': 'µ',
    '\\nu': 'ν',
    '\\xi': 'ξ',
    '\\pi': 'π',
    '\\varpi': 'ϖ',
    '\\rho': 'ρ',
    '\\varrho': 'ϱ',
    '\\sigma': 'σ',
    '\\varsigma': 'ς',
    '\\tau': 'τ',
    '\\upsilon': 'υ',
    '\\phi': 'φ',
    '\\varphi': 'φ',
    '\\chi': 'χ',
    '\\psi': 'ψ',
    '\\omega': 'ω',

    // Greek Alphabet (Upper)
    '\\Gamma': 'Γ',
    '\\Delta': 'Δ',
    '\\Theta': 'Θ',
    '\\Lambda': 'Λ',
    '\\Xi': 'Ξ',
    '\\Pi': 'Π',
    '\\Sigma': 'Σ',
    '\\Upsilon': 'Υ',
    '\\Phi': 'Φ',
    '\\Psi': 'Ψ',
    '\\Omega': 'Ω',

    // Ellipses & Spacing
    '\\dots': '…',
    '\\ldots': '…',
    '\\cdots': '…',
    '\\ddots': '⋱',
    '\\vdots': '⋮',
    '\\quad': '  ',
    '\\qquad': '    ',
    '\\,': ' ',
    '\\;': ' ',
    '\\:': ' ',
    '\\!': '',
};

/**
 * Converts a raw LaTeX mathematical expression into human-readable Unicode and HTML.
 */
function convertLatexExpression(expr) {
    if (!expr || typeof expr !== 'string') return '';
    let result = expr.trim();

    // 1. Text and styling wrappers: \text{...}, \mathrm{...}, \mathbf{...}, \mathit{...}
    result = result.replace(/\\(?:text|mathrm|operatorname)\{([^}]*)\}/g, '$1');
    result = result.replace(/\\(?:mathbf|textbf)\{([^}]*)\}/g, '<strong>$1</strong>');
    result = result.replace(/\\(?:mathit|textit)\{([^}]*)\}/g, '<em>$1</em>');

    // 2. Comma inside number groupings: {,} -> ,
    result = result.replace(/\{,\}/g, ',');

    // 3. Fractions: \frac{a}{b} -> (a / b)
    result = result.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1 / $2)');

    // 4. Roots: \sqrt[n]{x} -> n√(x), \sqrt{x} -> √(x)
    result = result.replace(/\\sqrt\[([^\]]*)\]\{([^}]*)\}/g, '$1√($2)');
    result = result.replace(/\\sqrt\{([^}]*)\}/g, '√($1)');

    // 5. Replace known LaTeX symbols
    for (const [cmd, sym] of Object.entries(LATEX_SYMBOLS)) {
        const escapedCmd = cmd.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
        const pattern = /[a-zA-Z]$/.test(cmd) ? new RegExp(`${escapedCmd}(?![a-zA-Z])`, 'g') : new RegExp(escapedCmd, 'g');
        result = result.replace(pattern, sym);
    }

    // 6. Subscripts: P_{95} -> P<sub>95</sub>, x_i -> x<sub>i</sub>
    result = result.replace(/([a-zA-Z0-9)\]])_\{([^}]+)\}/g, '$1<sub>$2</sub>');
    result = result.replace(/([a-zA-Z0-9)\]])_([a-zA-Z0-9]+)/g, '$1<sub>$2</sub>');

    // 7. Superscripts: 10^{6} -> 10<sup>6</sup>, x^2 -> x<sup>2</sup>
    result = result.replace(/([a-zA-Z0-9)\]])\^\{([^}]+)\}/g, '$1<sup>$2</sup>');
    result = result.replace(/([a-zA-Z0-9)\]])\^([a-zA-Z0-9]+)/g, '$1<sup>$2</sup>');

    // 8. Clean up loose braces: {val} -> val
    result = result.replace(/\{([^{}]+)\}/g, '$1');

    // 9. Clean up spacing
    result = result.replace(/\s+/g, ' ').trim();

    return result;
}

/**
 * Pre-processes Markdown text to convert LaTeX math ($...$ and $$...$$) outside code blocks into rendered symbols.
 */
function renderLatexMath(text) {
    if (!text || typeof text !== 'string') return '';

    // Step 1: Protect code blocks and inline code
    const codePlaceholders = [];
    let placeholderIndex = 0;

    // Preserve fenced code blocks
    let processed = text.replace(/(```[\s\S]*?```)/g, match => {
        const token = `%%PREECHAK_CODE_BLOCK_${placeholderIndex++}%%`;
        codePlaceholders.push({ token, value: match });
        return token;
    });

    // Preserve inline code
    processed = processed.replace(/(`[^`\n]+?`)/g, match => {
        const token = `%%PREECHAK_INLINE_CODE_${placeholderIndex++}%%`;
        codePlaceholders.push({ token, value: match });
        return token;
    });

    // Step 2: Convert block math $$ ... $$
    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, mathContent) => {
        const converted = convertLatexExpression(mathContent);
        return `<div class="math-block">${converted}</div>`;
    });

    // Step 3: Convert inline math $ ... $
    // Match non-empty content between non-escaped dollar signs that does not span newlines
    processed = processed.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (_, mathContent) => {
        // Skip standalone currency strings like "$100" without math syntax if it was accidentally matched
        const converted = convertLatexExpression(mathContent);
        return `<span class="math-inline">${converted}</span>`;
    });

    // Step 4: Restore code blocks and inline code
    for (const { token, value } of codePlaceholders) {
        processed = processed.replace(token, () => value);
    }

    return processed;
}

/**
 * Handle incomplete Markdown code fences during streaming.
 */
function completeStreamMarkdown(text) {
    if (!text || typeof text !== 'string') return '';
    // Count occurrences of triple backticks
    const matches = text.match(/```/g);
    if (matches && matches.length % 2 !== 0) {
        return text + '\n```';
    }
    return text;
}

/**
 * Main renderMarkdown function. Parses markdown text to sanitized HTML with highlighted code blocks.
 */
let mermaidInitialized = false;
let mermaidRenderCounter = 0;

/**
 * Render Mermaid placeholders after their Markdown has been attached to the DOM.
 * The source remains available in a details block if rendering is unavailable or fails.
 */
async function renderMermaidDiagrams(root) {
    const mermaid = typeof globalThis !== 'undefined' ? globalThis.mermaid : null;
    if (!root || !mermaid || typeof mermaid.render !== 'function') return false;

    if (!mermaidInitialized) {
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'dark',
            flowchart: { htmlLabels: false, useMaxWidth: true },
            sequence: { useMaxWidth: true },
        });
        mermaidInitialized = true;
    }

    const diagrams = Array.from(root.querySelectorAll('.mermaid-diagram:not([data-render-state])'));
    await Promise.all(
        diagrams.map(async diagram => {
            diagram.setAttribute('data-render-state', 'rendering');
            const target = diagram.querySelector('.mermaid-render-target');
            try {
                const source = decodeURIComponent(diagram.getAttribute('data-mermaid-source') || '');
                const id = `preechak-mermaid-${++mermaidRenderCounter}`;
                const result = await mermaid.render(id, source);
                if (target) target.innerHTML = typeof result === 'string' ? result : result.svg;
                if (result && typeof result.bindFunctions === 'function' && target) result.bindFunctions(target);
                diagram.setAttribute('data-render-state', 'rendered');
            } catch (error) {
                if (target) target.textContent = 'Diagram could not be rendered. Open “View Mermaid source” to inspect it.';
                diagram.classList.add('mermaid-render-error');
                diagram.setAttribute('data-render-state', 'error');
                console.warn('Error rendering Mermaid diagram:', error);
            }
        })
    );

    return diagrams.length > 0;
}

function renderMarkdown(content) {
    if (!content || typeof content !== 'string') return '';

    const { marked, hljs } = getDependencies();

    if (!marked) {
        // Fallback if marked is unavailable
        const mathProcessed = renderLatexMath(content);
        return `<p>${escapeHtml(mathProcessed)}</p>`;
    }

    const safeContent = completeStreamMarkdown(content);
    const mathContent = renderLatexMath(safeContent);

    try {
        const renderer = new marked.Renderer();

        renderer.code = function (code, language) {
            return renderCodeBlock(code, language, hljs);
        };

        renderer.link = function (href, title, text) {
            const safeHref = href || '#';
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
            return `<a href="${escapeHtml(safeHref)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
        };

        const parsedHtml = marked.parse(mathContent, {
            renderer: renderer,
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false,
        });

        return sanitizeHtml(parsedHtml);
    } catch (err) {
        console.warn('Error parsing markdown:', err);
        return `<p>${escapeHtml(content)}</p>`;
    }
}

/**
 * Clipboard copy handler with user feedback for click delegation on Lit components.
 */
async function handleCodeCopyClick(event) {
    const button = event.target ? event.target.closest('.code-block-copy-btn') : null;
    if (!button) return false;

    event.preventDefault();
    event.stopPropagation();

    const encodedCode = button.getAttribute('data-code');
    if (!encodedCode) return true;

    const rawCode = decodeURIComponent(encodedCode);

    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(rawCode);
        } else if (typeof document !== 'undefined') {
            const textarea = document.createElement('textarea');
            textarea.value = rawCode;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }

        button.classList.add('copied');
        const copyTextSpan = button.querySelector('.copy-text');
        if (copyTextSpan) copyTextSpan.textContent = 'Copied!';

        setTimeout(() => {
            button.classList.remove('copied');
            if (copyTextSpan) copyTextSpan.textContent = 'Copy code';
        }, 2000);
    } catch (err) {
        console.warn('Failed to copy code to clipboard:', err);
    }

    return true;
}

// Group only recognized top-level answer sections after sanitizing Markdown.
// Moving existing DOM nodes preserves diagrams, highlighted code and copy controls.
function collapseAnswerSections(html) {
    if (typeof document === 'undefined') return html;
    const template = document.createElement('template');
    template.innerHTML = html;
    const recognized =
        /^(?:what the question is asking|(?:visual )?chalkboard walkthrough|visual explanation|solution\s*[12]\s*[:—-]|what to say|key takeaways)/i;
    const nodes = [...template.content.childNodes];
    let section = null;
    let level = 0;
    for (const node of nodes) {
        const heading = /^H[1-3]$/.test(node.nodeName);
        const rank = heading ? Number(node.nodeName[1]) : 0;
        if (heading && recognized.test(node.textContent.trim())) {
            section = document.createElement('details');
            section.className = 'answer-section';
            section.open = true;
            const summary = document.createElement('summary');
            summary.textContent = node.textContent;
            section.append(summary);
            template.content.insertBefore(section, node);
            node.remove();
            level = rank;
        } else {
            if (heading && rank <= level) section = null;
            if (section) section.append(node);
        }
    }
    return template.innerHTML;
}

export {
    collapseAnswerSections,
    renderMarkdown,
    renderMermaidDiagrams,
    handleCodeCopyClick,
    escapeHtml,
    resolveLanguage,
    formatLanguageName,
    sanitizeHtml,
    completeStreamMarkdown,
    renderLatexMath,
    convertLatexExpression,
};
