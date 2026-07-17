-- Player Activity V1
--
-- Keep the public website's legacy review/script fields intact while adding
-- Player App-specific placement controls. Existing public queries continue to
-- use past_event_reviews.is_published/sort_order and scripts.is_featured.

-- ---------------------------------------------------------------------------
-- Large activities: extend the existing past-event review content source.
-- ---------------------------------------------------------------------------

ALTER TABLE public.past_event_reviews
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS title_ja text,
  ADD COLUMN IF NOT EXISTS summary_ja text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS content_ja text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS location_ja text,
  ADD COLUMN IF NOT EXISTS fee_note text,
  ADD COLUMN IF NOT EXISTS fee_note_ja text,
  ADD COLUMN IF NOT EXISTS capacity_note text,
  ADD COLUMN IF NOT EXISTS capacity_note_ja text,
  ADD COLUMN IF NOT EXISTS registration_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS show_on_player_home boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS player_home_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_in_player_library boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS player_library_order integer NOT NULL DEFAULT 0;

UPDATE public.past_event_reviews
SET status = CASE WHEN is_published THEN 'published' ELSE 'draft' END;

ALTER TABLE public.past_event_reviews
  DROP CONSTRAINT IF EXISTS past_event_reviews_status_check,
  DROP CONSTRAINT IF EXISTS past_event_reviews_time_order_check,
  ADD CONSTRAINT past_event_reviews_status_check
    CHECK (status IN ('draft', 'published', 'cancelled')),
  ADD CONSTRAINT past_event_reviews_time_order_check
    CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at);

CREATE UNIQUE INDEX IF NOT EXISTS past_event_reviews_source_key_unique
  ON public.past_event_reviews (source_key)
  WHERE source_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS past_event_reviews_player_home_order_idx
  ON public.past_event_reviews (
    show_on_player_home,
    player_home_order,
    start_at DESC,
    event_date DESC
  )
  WHERE status IN ('published', 'cancelled');

CREATE INDEX IF NOT EXISTS past_event_reviews_player_library_order_idx
  ON public.past_event_reviews (
    pin_in_player_library DESC,
    player_library_order,
    start_at DESC,
    event_date DESC
  )
  WHERE status IN ('published', 'cancelled');

-- Move the established public-site large-event catalogue into the shared
-- source of truth. source_key is stable across deployments and lets the public
-- fallback merge these rows without creating duplicate cards.
INSERT INTO public.past_event_reviews (
  source_key,
  title,
  title_ja,
  summary,
  summary_ja,
  cover_url,
  gallery_urls,
  event_date,
  is_published,
  sort_order,
  status,
  show_on_player_home,
  player_home_order,
  pin_in_player_library,
  player_library_order
)
VALUES
  (
    'red-packet-luck-battle',
    '红包欧皇争夺战',
    '紅包・豪運王争奪戦',
    '与新朋友一起闯关趣味游戏，征揽红包，争做终极欧皇！',
    '新しい友人と一緒にミニゲームに挑戦し、紅包を集めて究極の豪運王を目指します。',
    '/images/landing/activity-wall-20260520/red-packet-luck-battle-01.webp',
    '[]'::jsonb,
    DATE '2026-06-20', true, 10, 'published', true, 10, true, 10
  ),
  (
    'cat-mouse-game',
    '猫鼠游戏',
    '猫とネズミゲーム',
    '代代木公园里的神秘追捕，坚持到最后的人制胜。',
    '代々木公園でのミステリアスな追跡ゲーム。最後まで残った人が勝利。',
    '/images/landing/activity-wall-20260520/cat-mouse-game-01.webp',
    '[]'::jsonb,
    DATE '2026-06-13', true, 20, 'published', true, 20, true, 20
  ),
  (
    'moonlit-wolf-feast',
    '月夜狼宴',
    '月夜の人狼宴',
    '上野御徒町狼人杀。今夜，谎言与推理同时开始，争夺终极狼王。',
    '上野御徒町での人狼ゲーム。今夜、嘘と推理が同時に始まり、究極の狼王を競います。',
    '/images/landing/activity-wall-20260520/moonlit-wolf-feast-01.webp',
    '[]'::jsonb,
    DATE '2026-05-31', true, 30, 'published', false, 30, false, 30
  ),
  (
    'fuji-q-adventure',
    '富士急绝叫冒险日',
    '富士急絶叫アドベンチャーデー',
    '这是一次结合游乐园挑战、团队互动和轻社交的周末特别活动，一起边尖叫边快速拉近距离！',
    '遊園地チャレンジ、チーム交流、ライトな社交を組み合わせた週末特別企画。叫びながら一気に距離を縮めます。',
    '/images/landing/activity-wall-20260520/fuji-q-adventure-01.webp',
    '[]'::jsonb,
    DATE '2026-05-23', true, 40, 'published', false, 40, false, 40
  ),
  (
    'komatsuzawa-farm',
    '小松泽农园团建',
    '小松沢農園チーム活動',
    '城市太吵，农场刚好。这个周末，和竹溪社成员去小松泽农园过一天慢下来的田园生活吧。',
    '都会の喧騒を離れて農園へ。この週末、竹渓社のメンバーと小松沢農園でゆっくりした田園の一日を過ごします。',
    '/images/landing/activity-wall-20260520/komatsuzawa-farm-01.webp',
    '[]'::jsonb,
    DATE '2026-05-16', true, 50, 'published', false, 50, false, 50
  ),
  (
    'shinjuku-gyoen-color-picnic',
    '新宿御苑·色彩挑战野餐',
    '新宿御苑・カラーチャレンジピクニック',
    '这是一次结合野餐、游戏和轻社交的户外活动，让大家在春天的草地上轻松认识彼此。',
    'ピクニック、ゲーム、ライトな交流を組み合わせた屋外企画。春の芝生で気軽にお互いを知れる一日です。',
    '/images/landing/activity-wall-20260520/shinjuku-gyoen-color-picnic-01.webp',
    '[]'::jsonb,
    DATE '2026-04-25', true, 60, 'published', false, 60, false, 60
  ),
  (
    'spring-2026-welcome-party',
    '2026春学期迎新轰趴',
    '2026春学期ウェルカムホームパーティー',
    '竹溪社所有玩家26年春学期第一次线下见面的活动，一场让大家轻松相识、自然熟络的聚会。无论你是社交新手还是游戏高手，都能在这里找到同频的伙伴。',
    '竹渓社メンバーが2026年春学期に初めてオフラインで集まる会。自然に打ち解け、同じ温度感の仲間を見つけられるパーティーです。',
    '/images/landing/activity-wall-20260520/spring-2026-welcome-party-01.webp',
    '[]'::jsonb,
    DATE '2026-04-25', true, 70, 'published', false, 70, false, 70
  ),
  (
    'kpop-party',
    'Kpop 睡衣派对',
    'Kpopパジャマパーティー',
    '猜歌、宾果、零食和聊天，给 2025 年收个轻松的尾。',
    '曲当て、ビンゴ、お菓子と会話で、2025年を締めくくりました。',
    '/images/landing/activity-wall-20260520/kpop-01.webp',
    '[]'::jsonb,
    DATE '2025-12-21', true, 80, 'published', false, 80, false, 80
  ),
  (
    'bbq-gathering',
    '台场 BBQ 团建',
    '台場 BBQ',
    '海边、烤肉、聊天，活动后的关系更容易延续。',
    '海辺でBBQをしながら、活動後もつながりやすい時間です。',
    '/images/landing/activity-wall-20260520/bbq-01.webp',
    '["/images/landing/activity-wall-20260520/bbq-02.webp","/images/landing/activity-wall-20260520/bbq-03.webp","/images/landing/activity-wall-20260520/bbq-04.webp","/images/landing/activity-wall-20260520/bbq-05.webp","/images/landing/activity-wall-20260520/bbq-06.webp","/images/landing/activity-wall-20260520/bbq-07.webp","/images/landing/activity-wall-20260520/bbq-08.webp","/images/landing/activity-wall-20260520/bbq-09.webp"]'::jsonb,
    DATE '2025-11-24', true, 90, 'published', false, 90, false, 90
  ),
  (
    'team-games',
    '鱿鱼游戏',
    'イカゲーム',
    '分组闯关、选代号、猜卧底，第一次见面也有共同目标。',
    'チームで挑戦し、初対面でも共通の目的を持てる回です。',
    '/images/landing/activity-wall-20260520/team-game-01.webp',
    '["/images/landing/activity-wall-20260520/team-game-02.webp","/images/landing/activity-wall-20260520/team-game-03.webp","/images/landing/activity-wall-20260520/team-game-04.webp","/images/landing/activity-wall-20260520/team-game-05.webp","/images/landing/activity-wall-20260520/team-game-06.webp","/images/landing/activity-wall-20260520/team-game-07.webp","/images/landing/activity-wall-20260520/team-game-08.webp","/images/landing/activity-wall-20260520/team-game-09.webp"]'::jsonb,
    DATE '2025-11-15', true, 100, 'published', false, 100, false, 100
  ),
  (
    'autumn-trip',
    '秋游计划',
    '秋の遠足企画',
    '去东京近郊走一走，用户外任务和小组游戏打开周末。',
    '東京近郊での散歩とチームゲームで週末を過ごす企画です。',
    '/images/landing/activity-wall-20260520/autumn-trip-01.webp',
    '["/images/landing/activity-wall-20260520/autumn-trip-02.webp","/images/landing/activity-wall-20260520/autumn-trip-03.webp","/images/landing/activity-wall-20260520/autumn-trip-04.webp","/images/landing/activity-wall-20260520/autumn-trip-05.webp","/images/landing/activity-wall-20260520/autumn-trip-06.webp","/images/landing/activity-wall-20260520/autumn-trip-07.webp","/images/landing/activity-wall-20260520/autumn-trip-08.webp","/images/landing/activity-wall-20260520/autumn-trip-09.webp"]'::jsonb,
    DATE '2025-11-02', true, 110, 'published', false, 110, false, 110
  ),
  (
    'shibuya-party',
    '涩谷线下交友派对',
    '渋谷オフライン交流会',
    '第一场大型玩家欢迎会，把不同学校的人带到同一张桌边。',
    '初めての大型歓迎会で、違う学校の人たちが同じ場に集まりました。',
    '/images/landing/activity-wall-20260520/shibuya-party-01.webp',
    '["/images/landing/activity-wall-20260520/shibuya-party-02.webp","/images/landing/activity-wall-20260520/shibuya-party-03.webp","/images/landing/activity-wall-20260520/shibuya-party-04.webp","/images/landing/activity-wall-20260520/shibuya-party-05.webp","/images/landing/activity-wall-20260520/shibuya-party-06.webp","/images/landing/activity-wall-20260520/shibuya-party-07.webp","/images/landing/activity-wall-20260520/shibuya-party-08.webp","/images/landing/activity-wall-20260520/shibuya-party-09.webp"]'::jsonb,
    DATE '2025-10-19', true, 120, 'published', false, 120, false, 120
  ),
  (
    'boardgame-party',
    '桌游派对',
    'ボードゲーム会',
    '围桌玩一局，再从游戏话题延伸到聊天。',
    '一緒に遊びながら、自然に会話が広がります。',
    '/images/landing/activity-wall-20260520/boardgame-01.webp',
    '["/images/landing/activity-wall-20260520/boardgame-02.webp","/images/landing/activity-wall-20260520/boardgame-03.webp","/images/landing/activity-wall-20260520/boardgame-04.webp","/images/landing/activity-wall-20260520/boardgame-05.webp","/images/landing/activity-wall-20260520/boardgame-06.webp"]'::jsonb,
    DATE '2025-10-13', true, 130, 'published', false, 130, false, 130
  ),
  (
    'disney-trip',
    '竹溪社第一次团建',
    '竹渓社初のチーム活動',
    '一起去迪士尼，把第一次团建留在夏天。',
    'ディズニーで過ごした、初めてのチーム活動です。',
    '/images/landing/activity-wall-20260520/disney-01.webp',
    '["/images/landing/activity-wall-20260520/disney-02.webp","/images/landing/activity-wall-20260520/disney-03.webp","/images/landing/activity-wall-20260520/disney-04.webp","/images/landing/activity-wall-20260520/disney-05.webp","/images/landing/activity-wall-20260520/disney-06.webp","/images/landing/activity-wall-20260520/disney-07.webp","/images/landing/activity-wall-20260520/disney-08.webp","/images/landing/activity-wall-20260520/disney-09.webp"]'::jsonb,
    DATE '2025-07-09', true, 140, 'published', false, 140, false, 140
  ),
  (
    'zhuxi-founded',
    '竹溪社正式成立',
    '竹渓社設立',
    '竹溪社在东京正式成立。',
    '竹渓社が東京で設立されました。',
    '/images/landing/activity-wall-20260520/founded-01.webp',
    '[]'::jsonb,
    DATE '2025-04-19', true, 150, 'published', false, 150, false, 150
  )
ON CONFLICT (source_key) WHERE source_key IS NOT NULL
DO UPDATE SET
  title = EXCLUDED.title,
  title_ja = EXCLUDED.title_ja,
  summary = EXCLUDED.summary,
  summary_ja = EXCLUDED.summary_ja,
  cover_url = EXCLUDED.cover_url,
  gallery_urls = EXCLUDED.gallery_urls,
  event_date = EXCLUDED.event_date,
  is_published = EXCLUDED.is_published,
  sort_order = EXCLUDED.sort_order,
  status = EXCLUDED.status,
  show_on_player_home = EXCLUDED.show_on_player_home,
  player_home_order = EXCLUDED.player_home_order,
  pin_in_player_library = EXCLUDED.pin_in_player_library,
  player_library_order = EXCLUDED.player_library_order;

-- Published reviews remain public through the legacy policy. Approved members
-- additionally need cancelled activities for the Player library.
DROP POLICY IF EXISTS approved_members_read_player_activity_reviews
  ON public.past_event_reviews;
CREATE POLICY approved_members_read_player_activity_reviews
  ON public.past_event_reviews
  FOR SELECT
  TO authenticated
  USING (
    status IN ('published', 'cancelled')
    AND EXISTS (
      SELECT 1
      FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
    )
  );

-- ---------------------------------------------------------------------------
-- Social scripts: separate Player placement from the legacy public featured
-- flag so the public website presentation does not change.
-- ---------------------------------------------------------------------------

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS is_social_script boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_player_activity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS player_activity_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_in_social_library boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS social_library_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.scripts
  DROP CONSTRAINT IF EXISTS scripts_player_activity_requires_social_check,
  DROP CONSTRAINT IF EXISTS scripts_social_library_requires_social_check,
  ADD CONSTRAINT scripts_player_activity_requires_social_check
    CHECK (is_social_script OR NOT show_on_player_activity),
  ADD CONSTRAINT scripts_social_library_requires_social_check
    CHECK (is_social_script OR NOT pin_in_social_library);

CREATE INDEX IF NOT EXISTS scripts_player_activity_order_idx
  ON public.scripts (
    show_on_player_activity,
    player_activity_order,
    created_at DESC
  )
  WHERE is_published = true AND is_social_script = true;

CREATE INDEX IF NOT EXISTS scripts_social_library_order_idx
  ON public.scripts (
    pin_in_social_library DESC,
    social_library_order,
    created_at DESC
  )
  WHERE is_published = true AND is_social_script = true;

WITH ranked AS (
  SELECT
    script.id,
    row_number() OVER (
      ORDER BY script.created_at DESC, script.id
    ) AS position
  FROM public.scripts AS script
  WHERE script.is_published = true
    AND script.is_featured = true
  LIMIT 5
)
UPDATE public.scripts AS script
SET
  is_social_script = true,
  show_on_player_activity = true,
  player_activity_order = ranked.position * 10,
  pin_in_social_library = true,
  social_library_order = ranked.position * 10
FROM ranked
WHERE script.id = ranked.id;

-- ---------------------------------------------------------------------------
-- Singleton Player Activity settings.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.player_activity_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  social_home_limit smallint NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  CONSTRAINT player_activity_settings_singleton CHECK (id = 1),
  CONSTRAINT player_activity_settings_social_limit
    CHECK (social_home_limit BETWEEN 1 AND 12)
);

INSERT INTO public.player_activity_settings (id, social_home_limit)
VALUES (1, 5)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS player_activity_settings_updated_at
  ON public.player_activity_settings;
CREATE TRIGGER player_activity_settings_updated_at
  BEFORE UPDATE ON public.player_activity_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.player_activity_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approved_members_or_admin_read_player_activity_settings
  ON public.player_activity_settings;
CREATE POLICY approved_members_or_admin_read_player_activity_settings
  ON public.player_activity_settings
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.members AS member
      WHERE member.user_id = (SELECT auth.uid())
        AND member.status = 'approved'
    )
  );

DROP POLICY IF EXISTS admin_update_player_activity_settings
  ON public.player_activity_settings;
CREATE POLICY admin_update_player_activity_settings
  ON public.player_activity_settings
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()) AND id = 1);

REVOKE ALL ON TABLE public.player_activity_settings
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.player_activity_settings
  TO authenticated;
