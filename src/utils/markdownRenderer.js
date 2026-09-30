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
function renderCodeBlock(code, language, hljs) {
    const resolvedLang = resolveLanguage(language);
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
function renderMarkdown(content) {
    if (!content || typeof content !== 'string') return '';

    const { marked, hljs } = getDependencies();

    if (!marked) {
        // Fallback if marked is unavailable
        return `<p>${escapeHtml(content)}</p>`;
    }

    const safeContent = completeStreamMarkdown(content);

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

        const parsedHtml = marked.parse(safeContent, {
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

export { renderMarkdown, handleCodeCopyClick, escapeHtml, resolveLanguage, formatLanguageName, sanitizeHtml, completeStreamMarkdown };
