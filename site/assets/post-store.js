import { supabase } from './supabase-client.js';

export const FALLBACK_POST = Object.freeze({
  id: 'fallback',
  slug: 'no-created-post',
  title: 'No Created Post',
  excerpt: 'Posts are currently work in progress or no post has been pinned, Thank you for your patience.',
  content_html: '<p>Posts are currently work in progress or no post has been pinned, Thank you for your patience.</p>',
  full_thumb_url: '/assets/images/post-fallback-full.webp',
  poster_url: '/assets/images/post-fallback-poster.webp',
  published_at: new Date().toISOString(),
  href: 'https://dikagg007.in/404',
  isFallback: true,
});

export const postHref = (post) => post?.href || `/posts/${encodeURIComponent(post?.slug || '')}`;
export const postDate = (post) => post?.published_at || post?.created_at;

export async function getPublishedPosts(limit = 24) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('posts').select('*').eq('status', 'published').order('published_at', { ascending: false }).limit(limit);
  if (error) {
    if (/relation .*posts.* does not exist|schema cache/i.test(error.message || '')) return [];
    throw error;
  }
  return data || [];
}

export async function getPostBySlug(slug) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('posts').select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAllPosts() {
  const { data, error } = await supabase.from('posts').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export function publicPostMedia(path) {
  if (!path || !supabase) return '';
  return supabase.storage.from('post-media').getPublicUrl(path).data.publicUrl;
}

export async function uploadPostMedia(file, folder = 'misc') {
  const extension = (file.name.split('.').pop() || 'webp').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('post-media').upload(path, file, { cacheControl: '31536000', contentType: file.type, upsert: false });
  if (error) throw error;
  return { path, url: publicPostMedia(path) };
}

export async function savePost(record) {
  const query = record.id ? supabase.from('posts').update(record).eq('id', record.id).select().single() : supabase.from('posts').insert(record).select().single();
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function markPostNotified(id, channel, deliveredAt = new Date().toISOString()) {
  const field = channel === 'discord' ? 'discord_notified_at' : channel === 'email' ? 'email_notified_at' : '';
  if (!field) throw new Error('Unknown post notification channel.');
  const { data, error } = await supabase.from('posts').update({ [field]: deliveredAt }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePost(id) {
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) throw error;
}

export function safeRichHtml(html = '') {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script,style,iframe,object,embed,form,input,button').forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((node) => [...node.attributes].forEach((attribute) => {
    if (attribute.name.startsWith('on') || (['href','src'].includes(attribute.name) && /^\s*javascript:/i.test(attribute.value))) node.removeAttribute(attribute.name);
  }));
  template.content.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href') || '';
    if (!((href.startsWith('/') && !href.startsWith('//')) || /^https?:\/\//i.test(href))) anchor.removeAttribute('href');
    else { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  });
  return template.innerHTML;
}
