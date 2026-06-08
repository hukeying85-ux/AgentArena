/**
 * @fileoverview Task Pack Market component
 * Provides task pack browsing, search, and import functionality
 */

import { translate } from '../i18n.js';
import { h } from '../utils/dom.js';

// Task pack registry URL (GitHub raw)
const TASK_PACK_REGISTRY_URL = 'https://raw.githubusercontent.com/agentarena/agentarena/main/task-packs.json';
const TASK_PACK_IMPORT_URL_ERROR = 'Only HTTPS GitHub task pack JSON URLs are supported.';

function assertSafeGitHubPathSegments(segments) {
  if (segments.some((segment) => !/^[A-Za-z0-9._~-]+$/.test(segment) || segment === '.' || segment === '..')) {
    throw new Error(TASK_PACK_IMPORT_URL_ERROR);
  }
}

/**
 * Convert supported GitHub task pack URLs to raw JSON URLs.
 * @param {string} inputUrl
 * @returns {string}
 */
export function resolveTaskPackImportUrl(inputUrl) {
  let parsed;
  try {
    parsed = new URL(String(inputUrl ?? '').trim());
  } catch {
    throw new Error(TASK_PACK_IMPORT_URL_ERROR);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(TASK_PACK_IMPORT_URL_ERROR);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(TASK_PACK_IMPORT_URL_ERROR);
  }

  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);
  assertSafeGitHubPathSegments(segments);

  if (host === 'github.com') {
    const [user, repo, kind, branch, ...fileSegments] = segments;
    if (user && repo && !kind && !branch) {
      return `https://raw.githubusercontent.com/${user}/${repo}/main/taskpack.json`;
    }
    if (user && repo && kind === 'blob' && branch && fileSegments.length > 0) {
      const filePath = fileSegments.join('/');
      if (!filePath.toLowerCase().endsWith('.json')) {
        throw new Error(TASK_PACK_IMPORT_URL_ERROR);
      }
      return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`;
    }
    throw new Error(TASK_PACK_IMPORT_URL_ERROR);
  }

  if (host === 'raw.githubusercontent.com' && segments.length >= 4) {
    const filePath = segments.slice(3).join('/');
    if (!filePath.toLowerCase().endsWith('.json')) {
      throw new Error(TASK_PACK_IMPORT_URL_ERROR);
    }
    return parsed.href;
  }

  throw new Error(TASK_PACK_IMPORT_URL_ERROR);
}

/**
 * Task Pack Market class
 */
export class TaskPackMarket {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      registryUrl: options.registryUrl || TASK_PACK_REGISTRY_URL,
      onImport: options.onImport || (() => {}),
      language: options.language || 'en',
      ...options
    };
    this.packs = [];
    this.filteredPacks = [];
    this.searchQuery = '';
  }

  /** @param {string} key */
  t(key, ...args) {
    return translate(this.options.language, key, ...args);
  }

  /**
   * Initialize and load task pack list
   */
  async init() {
    await this.loadRegistry();
    this.render();
  }

  /**
   * Load task pack registry
   */
  async loadRegistry() {
    try {
      const response = await fetch(this.options.registryUrl, {
        cache: 'no-cache'
      });

      if (!response.ok) {
        throw new Error(this.t('marketLoadFailed', response.status));
      }

      this.packs = await response.json();
      this.filteredPacks = [...this.packs];
    } catch (err) {
      console.warn('Failed to load task pack registry:', err);
      this.packs = [];
      this.filteredPacks = [];
    }
  }

  /**
   * Search filter
   * @param {string} query - search keyword
   */
  filter(query) {
    this.searchQuery = query.toLowerCase().trim();

    if (!this.searchQuery) {
      this.filteredPacks = [...this.packs];
    } else {
      this.filteredPacks = this.packs.filter(pack =>
        pack.name.toLowerCase().includes(this.searchQuery) ||
        pack.description.toLowerCase().includes(this.searchQuery) ||
        pack.tags.some(tag => tag.toLowerCase().includes(this.searchQuery))
      );
    }

    this.renderList();
  }

  /**
   * Import task pack from GitHub URL
   * @param {string} url - GitHub repo URL
   */
  async importFromUrl(url) {
    try {
      const rawUrl = this._convertToRawUrl(url);

      const response = await fetch(rawUrl);
      if (!response.ok) {
        throw new Error(this.t('marketFetchFailed', response.status));
      }

      const taskPack = await response.json();

      if (!taskPack.id || !taskPack.tasks || !Array.isArray(taskPack.tasks)) {
        throw new Error(this.t('marketInvalidFormat'));
      }

      this.options.onImport(taskPack);
      return { success: true, pack: taskPack };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Convert GitHub URL to raw content URL
   * @param {string} url - GitHub URL
   * @returns {string} raw content URL
   */
  _convertToRawUrl(url) {
    try {
      return resolveTaskPackImportUrl(url);
    } catch {
      throw new Error(this.t('marketInvalidUrl'));
    }
  }

  /**
   * Render the market UI
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = '';

    const header = h('div', { className: 'market-header' },
      h('h3', { className: 'market-title' }, this.t('marketTitle')),
      h('p', { className: 'market-description' }, this.t('marketDescription'))
    );

    const searchBox = h('div', { className: 'market-search' },
      h('input', {
        type: 'text',
        className: 'market-search-input',
        placeholder: this.t('marketSearchPlaceholder'),
        oninput: (e) => this.filter(e.target.value)
      }),
      h('button', {
        className: 'market-import-btn',
        onclick: () => this.showImportDialog()
      }, this.t('marketImportUrl'))
    );

    this.listContainer = h('div', { className: 'market-list' });

    this.container.appendChild(header);
    this.container.appendChild(searchBox);
    this.container.appendChild(this.listContainer);

    this.renderList();
  }

  /**
   * Render task pack list
   */
  renderList() {
    if (!this.listContainer) return;

    this.listContainer.innerHTML = '';

    if (this.filteredPacks.length === 0) {
      this.listContainer.appendChild(
        h('div', { className: 'market-empty' },
          this.searchQuery
            ? this.t('marketNoResults')
            : this.t('marketEmpty')
        )
      );
      return;
    }

    for (const pack of this.filteredPacks) {
      const card = this._createPackCard(pack);
      this.listContainer.appendChild(card);
    }
  }

  /**
   * Create a task pack card
   * @param {Object} pack - task pack data
   * @returns {HTMLElement}
   */
  _createPackCard(pack) {
    const tags = pack.tags?.map(tag =>
      h('span', { className: 'market-tag' }, tag)
    ) || [];

    return h('div', { className: 'market-card' },
      h('div', { className: 'market-card-header' },
        h('h4', { className: 'market-card-title' }, pack.name),
        h('span', { className: 'market-card-count' }, this.t('marketTaskCount', pack.taskCount || '?'))
      ),
      h('p', { className: 'market-card-description' }, pack.description || ''),
      h('div', { className: 'market-card-tags' }, ...tags),
      h('div', { className: 'market-card-footer' },
        h('span', { className: 'market-card-author' }, `by ${pack.author || 'unknown'}`),
        h('button', {
          className: 'market-card-import',
          onclick: () => this.importFromUrl(pack.repo)
        }, this.t('marketImport'))
      )
    );
  }

  /**
   * Show import dialog.
   *
   * Accessibility:
   * - aria-modal + aria-labelledby + focus trap so screen readers and
   *   keyboard users can't tab out into the background page
   * - Escape closes
   * - Focus moves into the dialog on open, returns to the opener on close
   * - Inline status region replaces alert() (which interrupts screen-reader flow)
   */
  showImportDialog() {
    const previouslyFocused = document.activeElement;
    const dialogNonce = crypto.randomUUID();
    const titleId = `market-dialog-title-${dialogNonce}`;
    const statusId = `market-dialog-status-${dialogNonce}`;

    const titleEl = h('h4', { id: titleId }, this.t('marketDialogTitle'));
    const statusEl = h('div', {
      id: statusId,
      className: 'market-dialog-status',
      role: 'status',
      'aria-live': 'polite'
    });
    const input = h('input', {
      type: 'text',
      className: 'market-dialog-input',
      placeholder: 'https://github.com/user/repo',
      id: 'market-import-url',
      'aria-label': this.t('marketDialogTitle')
    });

    const closeDialog = () => {
      document.removeEventListener('keydown', onKeydown, true);
      dialog.remove();
      const opener = /** @type {HTMLElement | null} */ (previouslyFocused);
      if (opener && typeof opener.focus === 'function') {
        opener.focus();
      }
    };

    const cancelBtn = h('button', {
      type: 'button',
      className: 'market-dialog-cancel',
      onclick: closeDialog
    }, this.t('marketDialogCancel'));

    const confirmBtn = h('button', {
      type: 'button',
      className: 'market-dialog-confirm',
      onclick: async () => {
        const url = input.value.trim();
        if (!url) {
          statusEl.textContent = this.t('marketDialogHint');
          return;
        }
        confirmBtn.disabled = true;
        const result = await this.importFromUrl(url);
        confirmBtn.disabled = false;
        if (result.success) {
          statusEl.textContent = this.t('marketImportSuccess', result.pack.name);
          setTimeout(closeDialog, 800);
        } else {
          statusEl.textContent = this.t('marketImportFailed', result.error);
        }
      }
    }, this.t('marketDialogConfirm'));

    const dialog = h('div', {
        className: 'market-dialog-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId
      },
      h('div', { className: 'market-dialog' },
        titleEl,
        h('p', { className: 'market-dialog-hint' }, this.t('marketDialogHint')),
        input,
        statusEl,
        h('div', { className: 'market-dialog-actions' },
          cancelBtn,
          confirmBtn
        )
      )
    );

    // Focus trap: cycle Tab/Shift+Tab within dialog focusables; Escape closes.
    const focusables = () => /** @type {HTMLElement[]} */ (Array.from(dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )));

    function onKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDialog();
        return;
      }
      if (e.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeydown, true);

    document.body.appendChild(dialog);
    setTimeout(() => input.focus(), 0);
  }
}
