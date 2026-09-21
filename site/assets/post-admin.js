import { statusApi } from './api.js?v=6.6.0';
import { deletePost, getAllPosts, markPostNotified, savePost, uploadPostMedia } from './post-store.js?v=1.1.0';
import { esc, formatDate, showToast } from './layout.js?v=4.5.0';

const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 190);
const icon = (label, command, value = '') => `<button type="button" data-command="${command}" data-value="${value}" title="${label}">${label}</button>`;
const linkUrl = (value) => {
  const input = String(value || '').trim();
  if (input.startsWith('/') && !input.startsWith('//')) return input;
  try { const url = new URL(input); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
};

function convertMarkdownLinks(editor) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.parentElement?.closest('a,code,pre')) continue;
    const source = node.nodeValue;
    const pattern = /\[([^\]\n]+)\]\(([^\s)]+)\)/g;
    const matches = [...source.matchAll(pattern)].filter((match) => linkUrl(match[2]));
    if (!matches.length) continue;
    const selection = getSelection();
    const restoreCaret = selection?.isCollapsed && selection.anchorNode === node ? selection.anchorOffset : null;
    const fragment = document.createDocumentFragment();
    let lastAnchor = null;
    let last = 0;
    for (const match of matches) {
      fragment.append(document.createTextNode(source.slice(last, match.index)));
      const anchor = document.createElement('a');
      anchor.href = linkUrl(match[2]);
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = match[1];
      fragment.append(anchor);
      lastAnchor = anchor;
      last = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(source.slice(last)));
    node.replaceWith(fragment);
    if (restoreCaret === source.length && lastAnchor) {
      const range = document.createRange();
      range.setStartAfter(lastAnchor);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}
const dimensions = (file) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { URL.revokeObjectURL(image.src); resolve([image.naturalWidth, image.naturalHeight]); }; image.onerror = reject; image.src = URL.createObjectURL(file); });
async function requireRatio(file, expected, label) { if (!file) return; const [width,height] = await dimensions(file); if (Math.abs(width / height - expected) > .035) throw new Error(`${label} must use a ${expected > 1 ? '16:9' : '1:1'} aspect ratio.`); if (label === 'Thumbnail' && (width !== 2160 || height !== 2160)) throw new Error('Thumbnail must be exactly 2160×2160 pixels.'); }

export async function renderPostAdmin(root, nav) {
  root.innerHTML = `${nav()}<main class="container wide admin-page post-studio"><div class="admin-intro"><div><span class="eyebrow">Supabase publishing</span><h1>Post studio.</h1><p>Build rich posts, manage feature placement, and upload responsive artwork.</p></div></div><div data-post-studio-content><div class="panel">Loading posts…</div></div></main>`;
  await render(root);
}

async function render(root, editing = null) {
  const posts = await getAllPosts();
  const host = root.querySelector('[data-post-studio-content]');
  host.innerHTML = `<section class="post-editor-shell">
    <form data-post-form>
      <input type="hidden" name="id" value="${esc(editing?.id || '')}">
      <div class="post-editor-top"><input class="post-title-input" name="title" value="${esc(editing?.title || '')}" placeholder="Give your post a title…" maxlength="180" required><div class="post-publish-actions"><button class="button ghost" type="submit" data-save-status="draft">Save draft</button><button class="button primary" type="submit" data-save-status="published">Publish</button></div></div>
      <div class="post-toolbar" role="toolbar" aria-label="Post formatting">${icon('↶','undo')}${icon('↷','redo')}${icon('H2','formatBlock','H2')}${icon('H3','formatBlock','H3')}${icon('¶','formatBlock','P')}${icon('B','bold')}${icon('I','italic')}${icon('U','underline')}${icon('S','strikeThrough')}${icon('• List','insertUnorderedList')}${icon('1. List','insertOrderedList')}${icon('❝','formatBlock','BLOCKQUOTE')}${icon('Link','createLink')}<button type="button" data-insert-button title="Insert a linked button">Button</button><button type="button" data-inline-image title="Upload image at cursor">Image</button><button type="button" data-clear-format>Clear</button></div>
      <input type="file" data-inline-image-input accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>
      <div class="post-writing-area" data-editor contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Start writing your post…">${editing?.content_html || ''}</div>
      <p class="post-editor-hint">Tip: type [Text](https://example.com) for a link. Use Button to add a formatted call to action.</p>
      <dialog class="post-button-dialog" data-button-dialog aria-label="Button link settings"><div class="post-button-dialog-content"><h2>Button link</h2><label>Button text<input name="button_text" maxlength="100" placeholder="Read more"></label><label>Link URL<input name="button_url" placeholder="https://example.com"></label><div class="post-button-options"><label>Style<select name="button_style"><option value="primary">Filled</option><option value="outline">Outline</option></select></label><label>Alignment<select name="button_align"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div><div class="post-button-dialog-actions"><button type="button" class="button ghost" data-cancel-button>Cancel</button><button type="button" class="button primary" data-confirm-button>Insert button</button></div></div></dialog>
      <div class="post-meta-grid"><label>Slug<input name="slug" value="${esc(editing?.slug || '')}" placeholder="generated-from-title"></label><label>Excerpt<textarea name="excerpt" maxlength="500" required placeholder="A short summary for cards and search.">${esc(editing?.excerpt || '')}</textarea></label></div>
      <div class="post-art-grid"><label class="art-upload"><span>Full Thumb <b>16:9</b></span><small>Hero, lead card, and full-width artwork</small><input type="file" name="full_thumb" accept="image/*" ${editing ? '' : 'required'}><img data-full-preview src="${esc(editing?.full_thumb_url || '/assets/images/post-fallback-full.webp')}" alt=""></label><label class="art-upload poster"><span>Thumbnail <b>1:1 · 2160×2160</b></span><small>Square artwork for the header drawer and compact cards</small><input type="file" name="poster" accept="image/*" ${editing ? '' : 'required'}><img data-poster-preview src="${esc(editing?.poster_url || '/assets/images/post-fallback-poster.webp')}" alt=""></label></div>
      <label class="gallery-upload">Additional inline images<input type="file" name="gallery" accept="image/*" multiple><small>Choose any number of supporting images. They are uploaded to the post media library.</small></label>
      <div class="post-feature-row"><label><input type="checkbox" name="is_hero" ${editing?.is_hero ? 'checked' : ''}> Feature in hero <small>Maximum 3; the oldest selection is removed automatically.</small></label><label><input type="checkbox" name="is_pinned" ${editing?.is_pinned ? 'checked' : ''}> Pin post <small>Maximum 6; the oldest selection is removed automatically.</small></label></div>
    </form>
  </section>
  <section class="published-posts"><div class="panel-heading"><div><span class="eyebrow">Library</span><h2>All posts</h2></div><span>${posts.length} total</span></div><div class="post-manage-grid">${posts.map(postCard).join('') || '<div class="empty-card">No Supabase posts yet.</div>'}</div></section>`;
  bind(root, posts);
}

function bind(root, posts) {
  const form = root.querySelector('[data-post-form]');
  const editor = root.querySelector('[data-editor]');
  const inlineInput = form.querySelector('[data-inline-image-input]');
  const buttonDialog = form.querySelector('[data-button-dialog]');
  const pendingInline = [];
  let imageUploadQueue = Promise.resolve();
  let savedImageRange = null;
  let savedButtonRange = null;
  let editingButton = null;
  let submitStatus = 'draft';
  const editorRange = () => {
    const selection = getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) return range.cloneRange();
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  };
  const placeUploadedImage = (range, uploaded, file) => {
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    const caption = document.createElement('figcaption');
    image.src = uploaded.url;
    image.alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    caption.innerHTML = '<br>';
    figure.append(image, caption);
    range.deleteContents();
    range.insertNode(figure);
    range.setStartAfter(figure);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    pendingInline.push(uploaded);
    editor.focus();
    return range;
  };
  const queueInlineImages = (files, initialRange) => {
    if (!files.length) return;
    imageUploadQueue = imageUploadQueue.then(async () => {
      editor.setAttribute('aria-busy', 'true');
      let range = initialRange;
      try {
        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name || 'Image'} is larger than 20 MB.`);
          const folder = slugify(form.elements.slug.value || form.elements.title.value) || 'draft';
          const uploaded = await uploadPostMedia(file, `${folder}/inline`);
          range = placeUploadedImage(range, uploaded, file);
        }
        showToast(files.length === 1 ? 'Image uploaded and inserted.' : `${files.length} images uploaded and inserted.`);
      } catch (error) { showToast(error.message || 'The image could not be uploaded.', 'error'); }
      finally { editor.removeAttribute('aria-busy'); }
    });
  };
  form.querySelectorAll('[data-save-status]').forEach((button) => button.addEventListener('click', () => { submitStatus = button.dataset.saveStatus; }));
  form.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('mousedown', (event) => event.preventDefault()));
  form.querySelector('[data-insert-button]').addEventListener('mousedown', (event) => event.preventDefault());
  form.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => {
    let value = button.dataset.value || null;
    if (button.dataset.command === 'createLink') {
      value = linkUrl(prompt('Paste the link URL (https:// or /path):'));
      if (!value) return;
    }
    if (value !== '') {
      document.execCommand(button.dataset.command, false, value);
      if (button.dataset.command === 'createLink') {
        const selection = getSelection();
        const anchor = selection?.anchorNode?.parentElement?.closest('a');
        if (anchor && editor.contains(anchor)) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
      }
    }
    editor.focus();
  }));
  form.querySelector('[data-insert-button]').onclick = () => {
    editingButton = null;
    savedButtonRange = editorRange();
    buttonDialog.querySelector('[name="button_text"]').value = getSelection()?.toString().trim().slice(0, 100) || '';
    buttonDialog.querySelector('[name="button_url"]').value = '';
    buttonDialog.querySelector('[name="button_style"]').value = 'primary';
    buttonDialog.querySelector('[name="button_align"]').value = 'left';
    buttonDialog.querySelector('[data-confirm-button]').textContent = 'Insert button';
    buttonDialog.showModal();
    buttonDialog.querySelector('[name="button_text"]').focus();
  };
  form.querySelector('[data-cancel-button]').onclick = () => buttonDialog.close();
  buttonDialog.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); form.querySelector('[data-confirm-button]').click(); } });
  form.querySelector('[data-confirm-button]').onclick = () => {
    const label = buttonDialog.querySelector('[name="button_text"]').value.trim();
    const href = linkUrl(buttonDialog.querySelector('[name="button_url"]').value);
    if (!label || !href) { showToast('Enter button text and a valid https:// link or /path.', 'error'); return; }
    const style = buttonDialog.querySelector('[name="button_style"]').value === 'outline' ? 'outline' : 'primary';
    const align = ['left', 'center', 'right'].includes(buttonDialog.querySelector('[name="button_align"]').value) ? buttonDialog.querySelector('[name="button_align"]').value : 'left';
    if (editingButton) {
      editingButton.href = href;
      editingButton.textContent = label;
      editingButton.className = `post-link-button ${style}`;
      editingButton.target = '_blank';
      editingButton.rel = 'noopener noreferrer';
      editingButton.parentElement.className = `post-link-button-row align-${align}`;
      editingButton = null;
      buttonDialog.close();
      editor.focus();
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.className = `post-link-button-row align-${align}`;
    const anchor = document.createElement('a');
    anchor.className = `post-link-button ${style}`;
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = label;
    wrapper.append(anchor);
    const range = savedButtonRange || editorRange();
    const block = (range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement)?.closest('p,h2,h3,blockquote,ul,ol,figure,div');
    if (block && block !== editor && editor.contains(block)) range.setStartAfter(block);
    range.collapse(true);
    range.insertNode(wrapper);
    range.setStartAfter(wrapper);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    buttonDialog.close();
    editor.focus();
  };
  editor.addEventListener('click', (event) => {
    const anchor = event.target.closest('a');
    if (!anchor) return;
    event.preventDefault();
    if (!anchor.classList.contains('post-link-button')) return;
    editingButton = anchor;
    buttonDialog.querySelector('[name="button_text"]').value = anchor.textContent;
    buttonDialog.querySelector('[name="button_url"]').value = anchor.getAttribute('href');
    buttonDialog.querySelector('[name="button_style"]').value = anchor.classList.contains('outline') ? 'outline' : 'primary';
    buttonDialog.querySelector('[name="button_align"]').value = anchor.parentElement.classList.contains('align-center') ? 'center' : anchor.parentElement.classList.contains('align-right') ? 'right' : 'left';
    buttonDialog.querySelector('[data-confirm-button]').textContent = 'Save button';
    buttonDialog.showModal();
  });
  editor.addEventListener('input', (event) => { if (!event.isComposing && event.data === ')') convertMarkdownLinks(editor); });
  form.querySelector('[data-clear-format]').onclick = () => document.execCommand('removeFormat');
  form.querySelector('[data-inline-image]').onclick = () => { savedImageRange = editorRange(); inlineInput.value = ''; inlineInput.click(); };
  inlineInput.onchange = () => queueInlineImages([...inlineInput.files], savedImageRange || editorRange());
  editor.addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.items || [])].filter((item) => item.kind === 'file' && item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean);
    if (!files.length) return;
    event.preventDefault();
    queueInlineImages(files, editorRange());
  });

  const preview = (input, selector) => input.addEventListener('change', () => { const file = input.files[0]; if (file) root.querySelector(selector).src = URL.createObjectURL(file); });
  preview(form.elements.full_thumb, '[data-full-preview]'); preview(form.elements.poster, '[data-poster-preview]');
  if (!form.elements.slug.value) form.elements.title.addEventListener('input', () => { form.elements.slug.value = slugify(form.elements.title.value); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector(`[data-save-status="${submitStatus}"]`); button.disabled = true;
    try {
      await imageUploadQueue;
      const existing = posts.find((post) => post.id === form.elements.id.value);
      const folder = slugify(form.elements.slug.value || form.elements.title.value) || crypto.randomUUID();
      await requireRatio(form.elements.full_thumb.files[0], 16 / 9, 'Full Thumb');
      await requireRatio(form.elements.poster.files[0], 1, 'Thumbnail');
      const full = form.elements.full_thumb.files[0] ? await uploadPostMedia(form.elements.full_thumb.files[0], `${folder}/full`) : { path: existing?.full_thumb_path, url: existing?.full_thumb_url };
      const poster = form.elements.poster.files[0] ? await uploadPostMedia(form.elements.poster.files[0], `${folder}/poster`) : { path: existing?.poster_path, url: existing?.poster_url };
      convertMarkdownLinks(editor);
      const currentHtml = editor.innerHTML.trim();
      const gallery = [...(existing?.gallery || []), ...pendingInline].filter((item, index, items) => ((item.url && currentHtml.includes(item.url)) || (item.path && currentHtml.includes(item.path))) && items.findIndex((candidate) => candidate.path === item.path) === index);
      const added = [];
      for (const file of form.elements.gallery.files) { const uploaded = await uploadPostMedia(file, `${folder}/gallery`); gallery.push(uploaded); added.push(uploaded); }
      const now = new Date().toISOString();
      const galleryHtml = added.map((item) => `<figure><img src="${item.url}" alt=""><figcaption></figcaption></figure>`).join('');
      const saved = await savePost({ id: existing?.id, slug: folder, title: form.elements.title.value.trim(), excerpt: form.elements.excerpt.value.trim(), content_html: currentHtml + galleryHtml, full_thumb_url: full.url, full_thumb_path: full.path, poster_url: poster.url, poster_path: poster.path, gallery, status: submitStatus, is_hero: form.elements.is_hero.checked, is_pinned: form.elements.is_pinned.checked, published_at: submitStatus === 'published' ? existing?.published_at || now : existing?.published_at || null });
      const firstPublish = submitStatus === 'published' && existing?.status !== 'published';
      if (firstPublish) {
        const results = await Promise.allSettled(['discord', 'email'].map((channel) => notifyPost(saved, channel)));
        const failures = results.map((result, index) => result.status === 'rejected' ? `${index ? 'Email' : 'Discord'}: ${result.reason?.message || 'delivery failed'}` : '').filter(Boolean);
        showToast(failures.length ? `Post published. ${failures.join(' · ')}` : 'Post published and sent to Discord and subscribers.', failures.length ? 'error' : undefined);
      } else showToast(submitStatus === 'published' ? 'Post updated without sending duplicate notifications.' : 'Draft saved.');
      await render(root);
    } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
  });
  root.querySelectorAll('[data-edit-post]').forEach((button) => button.onclick = () => render(root, posts.find((post) => post.id === button.dataset.editPost)));
  root.querySelectorAll('[data-notify-post]').forEach((button) => button.onclick = async () => {
    const post = posts.find((item) => item.id === button.dataset.notifyPost);
    if (!post) return;
    button.disabled = true;
    try {
      await notifyPost(post, button.dataset.channel);
      showToast(button.dataset.channel === 'discord' ? 'Post sent to Discord.' : 'Post emailed to subscribers.');
      await render(root);
    } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
  });
  root.querySelectorAll('[data-delete-post]').forEach((button) => button.onclick = async () => { if (!confirm('Delete this post permanently?')) return; try { await deletePost(button.dataset.deletePost); showToast('Post deleted.'); await render(root); } catch (error) { showToast(error.message, 'error'); } });
}

function postCard(post) {
  const published = post.status === 'published';
  const discordStatus = post.discord_notified_at ? `sent ${formatDate(post.discord_notified_at)}` : 'not sent';
  const emailStatus = post.email_notified_at ? `sent ${formatDate(post.email_notified_at)}` : 'not sent';
  const artwork=post.full_thumb_url||post.poster_url||'/assets/images/post-fallback-full.webp';
  return `<article class="post-library-card"><a class="post-library-preview" href="/posts/${encodeURIComponent(post.slug)}" target="_blank" rel="noopener"><img src="${esc(artwork)}" alt=""><span class="post-library-shade"></span><span class="post-library-copy"><small>${formatDate(post.published_at||post.updated_at,{dateStyle:'long'})}</small><strong>${esc(post.title)}</strong><em>Open preview →</em></span></a><div class="post-library-controls"><div class="post-library-state"><span class="status-pill ${published ? 'good' : 'unknown'}">${esc(post.status)}</span><span>${post.is_hero ? 'Hero' : ''}${post.is_hero&&post.is_pinned?' · ':''}${post.is_pinned ? 'Pinned' : ''}</span></div>${post.excerpt?`<p>${esc(post.excerpt)}</p>`:''}${published ? `<div class="post-delivery-status"><span class="${post.discord_notified_at ? 'sent' : 'missing'}">Discord ${discordStatus}</span><span class="${post.email_notified_at ? 'sent' : 'missing'}">Email ${emailStatus}</span></div>` : ''}<div class="post-manage-actions"><button class="button small primary" type="button" data-edit-post="${post.id}">Edit post</button>${published ? `<button class="button small ghost" type="button" data-notify-post="${post.id}" data-channel="discord">${post.discord_notified_at ? 'Send Discord again' : 'Send to Discord'}</button><button class="button small ghost" type="button" data-notify-post="${post.id}" data-channel="email">${post.email_notified_at ? 'Email again' : 'Email subscribers'}</button>` : ''}<button class="button small danger" type="button" data-delete-post="${post.id}">Delete</button></div></div></article>`;
}

async function notifyPost(post, channel) {
  const result = await statusApi('notify_post', { channel, id: post.id, slug: post.slug, title: post.title, excerpt: post.excerpt });
  await markPostNotified(post.id, channel, result.deliveredAt || new Date().toISOString());
  return result;
}
