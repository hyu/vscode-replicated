# VS Code Extension Webview Limitations

## Supported CSS Features

✅ **CSS Transitions**: All properties supported (`transition`, `transform`, `opacity`, colors, etc.)
✅ **CSS Animations**: Full `@keyframes` support
✅ **Transforms**: GPU-accelerated (`translate`, `scale`, `rotate`, `skew`)

## Critical Limitations

### Content Security Policy (CSP)
- ❌ **No inline scripts**: Cannot use `onclick="..."` - must use `<script>` tags
- ❌ **No external resources**: Cannot load from CDNs/external URLs without `asWebviewUri()`
- ❌ **No `eval()`**: Dynamic code execution blocked
- ✅ **Workaround**: Bundle all JS in `<script>` tags within HTML

### Resource Loading
- ❌ **No `file://` URIs**: Cannot access local file system directly
- ✅ **Must use `asWebviewUri()`**: Convert local URIs via `webview.asWebviewUri(localUri)`
- ✅ **Resources must be in `localResourceRoots`**

```typescript
// ✅ Correct
const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css')
);
```

### Performance
- ⚠️ **Avoid layout-triggering animations**: `width`, `height`, `top`, `left` cause layout recalculation
- ✅ **Prefer GPU-accelerated**: Use `transform` and `opacity` instead
- ✅ **Keep durations short**: 0.1s-0.3s (match VS Code design language)

```css
/* ✅ Good - GPU accelerated */
.element { transition: transform 0.2s ease, opacity 0.2s ease; }

/* ❌ Avoid - triggers layout */
.element { transition: width 0.2s ease, height 0.2s ease; }
```

## Best Practices

1. **Use VS Code theme variables**: `var(--vscode-font-family)`, `var(--vscode-foreground)`, etc.
2. **Theme classes**: `body.vscode-light`, `body.vscode-dark`, `body.vscode-high-contrast`
3. **GPU-accelerated animations**: `transform` + `opacity` only
4. **Subtle animations**: 0.1s-0.3s durations, purposeful motion
5. **Scripts**: Use `<script>` tags, not inline handlers

## Common Patterns

**Dropdown animation:**
```css
.dropdown-menu {
    opacity: 0;
    transform: translateY(-8px) scale(0.95);
    pointer-events: none;
    transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
.dropdown-menu.show {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
}
```

**Loading spinner:**
```css
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.loading-spinner { animation: spin 1s linear infinite; }
```

## Browser & Media

- **Engine**: Electron's Chromium (modern CSS supported)
- **Media**: Audio (WAV, MP3, Ogg, FLAC), Video (H.264, VP8) - limited codec support
- **Test**: Across different VS Code versions

## Quick Checklist

- [ ] Use VS Code CSS variables (`var(--vscode-*)`)
- [ ] Prefer `transform`/`opacity` over layout properties
- [ ] Keep animations 0.1s-0.3s duration
- [ ] Use `<script>` tags (not inline scripts)
- [ ] Use `asWebviewUri()` for local resources
- [ ] Avoid animating `width`/`height`/`top`/`left`

## Documentation

- [VS Code UX Guidelines](https://code.visualstudio.com/api/ux-guidelines) - Overview of VS Code UI architecture and patterns
- [Webviews UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/webviews) - Best practices for webview design
- [Webview Extension Guide](https://code.visualstudio.com/api/extension-guides/webview) - API documentation and implementation guide
- [Sidebars UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/sidebars) - Sidebar-specific design patterns
- [Theme Color Reference](https://code.visualstudio.com/api/references/theme-color) - Available CSS variables for theming
