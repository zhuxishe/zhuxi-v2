-- Match the published treehole feed's like-count ordering. Keeping the
-- published predicate aligned with the query makes this index smaller and
-- avoids indexing draft, hidden, or deleted community content.
CREATE INDEX IF NOT EXISTS community_posts_likes_idx
  ON public.community_posts (post_type, like_count DESC, published_at DESC, id DESC)
  WHERE status = 'published';
