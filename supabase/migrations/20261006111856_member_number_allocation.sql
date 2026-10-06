-- Membership numbers: private offline reservations, atomic allocation, and
-- durable non-reuse through the existing immutable member audit log.
-- No member/account rows and no new tables are created by the offline roster.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '15min';
LOCK TABLE public.members IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.member_identity IN SHARE ROW EXCLUSIVE MODE;
SELECT pg_advisory_xact_lock(hashtextextended('membership_number_allocation', 0));

CREATE OR REPLACE FUNCTION private.member_number_roster()
RETURNS TABLE(full_name text, member_number text)
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $roster$
  VALUES
    ('竹溪社官方', 'ZXS_000'),
    ('陈风', 'ZXS_001'),
    ('张艺馨', 'ZXS_002'),
    ('海美珍', 'ZXS_003'),
    ('黄紫琪', 'ZXS_004'),
    ('沙桃', 'ZXS_005'),
    ('吴悦桐', 'ZXS_006'),
    ('李其霏', 'ZXS_007'),
    ('李柯豪', 'ZXS_008'),
    ('王嫈筑', 'ZXS_009'),
    ('梁钥斌', 'ZXS_010'),
    ('薛惠仁', 'ZXS_011'),
    ('林森钰', 'ZXS_012'),
    ('徐晨峻', 'ZXS_013'),
    ('钱婧琦', 'ZXS_014'),
    ('钟灵逸', 'ZXS_015'),
    ('田松源', 'ZXS_016'),
    ('李佩泽', 'ZXS_017'),
    ('朱星语', 'ZXS_018'),
    ('李冰', 'ZXS_019'),
    ('曲健纬', 'ZXS_020'),
    ('孟申奥', 'ZXS_021'),
    ('陶旭', 'ZXS_022'),
    ('朱思颖', 'ZXS_023'),
    ('黄郁雯', 'ZXS_024'),
    ('骆仡轩', 'ZXS_025'),
    ('杨令初', 'ZXS_026'),
    ('敬佳佳', 'ZXS_027'),
    ('朱天宇', 'ZXS_028'),
    ('吴飞越', 'ZXS_029'),
    ('邓旖昕', 'ZXS_030'),
    ('郭月明', 'ZXS_031'),
    ('席澜睿', 'ZXS_032'),
    ('陈佳俊', 'ZXS_033'),
    ('赵苏蓉', 'ZXS_034'),
    ('李臻豪', 'ZXS_035'),
    ('周雨蒙', 'ZXS_036'),
    ('余逸文', 'ZXS_037'),
    ('李卓伦', 'ZXS_038'),
    ('许晴', 'ZXS_039'),
    ('梁相楠', 'ZXS_040'),
    ('常啸天', 'ZXS_041'),
    ('臧衍若', 'ZXS_042'),
    ('方奥陶', 'ZXS_043'),
    ('王雪祺', 'ZXS_044'),
    ('杨涛', 'ZXS_045'),
    ('万可', 'ZXS_046'),
    ('李楷华', 'ZXS_047'),
    ('张若珣', 'ZXS_048'),
    ('鹿一通', 'ZXS_049'),
    ('曹逸凡', 'ZXS_050'),
    ('李致远', 'ZXS_051'),
    ('白泽悦', 'ZXS_052'),
    ('袁震宇', 'ZXS_053'),
    ('缪一帆', 'ZXS_054'),
    ('陆芷琳', 'ZXS_055'),
    ('朱言能', 'ZXS_056'),
    ('汪栩同', 'ZXS_057'),
    ('叶淑雯', 'ZXS_058'),
    ('李思齐', 'ZXS_059'),
    ('侯博望', 'ZXS_060'),
    ('こっちゃん', 'ZXS_061'),
    ('荣朗', 'ZXS_062'),
    ('梅心怡', 'ZXS_063'),
    ('李昕蓉', 'ZXS_064'),
    ('南以勒', 'ZXS_065'),
    ('邱子卉', 'ZXS_066'),
    ('梁真真', 'ZXS_067'),
    ('王典迎', 'ZXS_068'),
    ('吴桐', 'ZXS_069'),
    ('翁璇翔', 'ZXS_070'),
    ('张致宁', 'ZXS_071'),
    ('李好', 'ZXS_072'),
    ('廖辰泰', 'ZXS_073'),
    ('李宛萦', 'ZXS_074'),
    ('周怡然', 'ZXS_075'),
    ('鲍怡天', 'ZXS_076'),
    ('张一阳', 'ZXS_077'),
    ('陈墨', 'ZXS_078'),
    ('张金诺', 'ZXS_079'),
    ('李如轩', 'ZXS_080'),
    ('吴璠', 'ZXS_081'),
    ('朱捍华', 'ZXS_082'),
    ('李秋翰', 'ZXS_083'),
    ('贺宝怡', 'ZXS_084'),
    ('吕嘉玥', 'ZXS_085'),
    ('王艺霏', 'ZXS_086'),
    ('孙致彬', 'ZXS_087'),
    ('阴凯博', 'ZXS_088'),
    ('王臻', 'ZXS_089'),
    ('刘铭洋', 'ZXS_090'),
    ('李延栋', 'ZXS_091'),
    ('金蕾', 'ZXS_092'),
    ('王毅', 'ZXS_093'),
    ('龙煜霖', 'ZXS_094'),
    ('孙文怡', 'ZXS_095'),
    ('李竹清', 'ZXS_096'),
    ('刘子彦', 'ZXS_097'),
    ('程昊阳', 'ZXS_098'),
    ('许泽伟', 'ZXS_099'),
    ('邹韩憧憬', 'ZXS_100'),
    ('施吴昊', 'ZXS_101'),
    ('丛天祥', 'ZXS_102'),
    ('朱林琦', 'ZXS_103'),
    ('丹野安歌', 'ZXS_104'),
    ('宗姝辰', 'ZXS_105'),
    ('董子钰', 'ZXS_106'),
    ('齐浩博', 'ZXS_107'),
    ('张敏', 'ZXS_108'),
    ('李响', 'ZXS_109'),
    ('蒋丰泽', 'ZXS_110'),
    ('米杭', 'ZXS_111'),
    ('姚明里', 'ZXS_112'),
    ('杨派', 'ZXS_113'),
    ('徐敏凡', 'ZXS_114'),
    ('翟天宇', 'ZXS_115'),
    ('石惟健', 'ZXS_116'),
    ('杨启航', 'ZXS_117'),
    ('高鹏玮', 'ZXS_118'),
    ('祝安东', 'ZXS_119'),
    ('陈妙言', 'ZXS_120'),
    ('埜藤未来', 'ZXS_121'),
    ('邓钧文', 'ZXS_122'),
    ('侯宇昻', 'ZXS_123'),
    ('曾颖颐', 'ZXS_124'),
    ('黄浩淳', 'ZXS_125'),
    ('冷杨', 'ZXS_126'),
    ('叶子愉', 'ZXS_127'),
    ('向倬纬', 'ZXS_128'),
    ('陈双', 'ZXS_129'),
    ('王睿勤', 'ZXS_130'),
    ('张晴奕', 'ZXS_131'),
    ('奕涵丰', 'ZXS_132'),
    ('高一鹤', 'ZXS_133'),
    ('黄龑枫', 'ZXS_134'),
    ('杨胜杰', 'ZXS_135'),
    ('郁怀宗', 'ZXS_136'),
    ('辛中兴', 'ZXS_137'),
    ('朴惠娟', 'ZXS_138'),
    ('龚海宇', 'ZXS_139'),
    ('林逸勤', 'ZXS_140'),
    ('朱颜', 'ZXS_141'),
    ('路一帆', 'ZXS_142'),
    ('朴健荣', 'ZXS_143'),
    ('刘晋铭', 'ZXS_144'),
    ('櫻井郁紗', 'ZXS_145'),
    ('朱俊帆', 'ZXS_146'),
    ('颜瑜德', 'ZXS_147'),
    ('黄钰涵', 'ZXS_148'),
    ('常皓宇', 'ZXS_149'),
    ('李少奇', 'ZXS_150'),
    ('訾眷桉', 'ZXS_151'),
    ('丁瑜', 'ZXS_152'),
    ('李云鹏', 'ZXS_153'),
    ('刘雨桥', 'ZXS_154'),
    ('雷博强', 'ZXS_155'),
    ('王佩', 'ZXS_156'),
    ('许原逢', 'ZXS_157'),
    ('李梦琦', 'ZXS_158'),
    ('柏怡冰', 'ZXS_159'),
    ('吴朝奔', 'ZXS_160'),
    ('倪培元', 'ZXS_161'),
    ('董思远', 'ZXS_162'),
    ('张钰', 'ZXS_163'),
    ('刘宇博', 'ZXS_164'),
    ('郷古慧琳', 'ZXS_165'),
    ('何易轩', 'ZXS_166'),
    ('何可欣', 'ZXS_167'),
    ('李雨芊', 'ZXS_168'),
    ('霍纪豪', 'ZXS_169'),
    ('刘钰', 'ZXS_170'),
    ('杨瑾瑜', 'ZXS_171'),
    ('叶思涵', 'ZXS_172'),
    ('纪雨霖', 'ZXS_173'),
    ('陈雨', 'ZXS_174'),
    ('程王鑫君', 'ZXS_175'),
    ('黎培德', 'ZXS_176'),
    ('刘诗璐', 'ZXS_177'),
    ('袁睿辰', 'ZXS_178'),
    ('吕广全', 'ZXS_179'),
    ('包佳妮', 'ZXS_180'),
    ('田钰', 'ZXS_181'),
    ('陈雨荷', 'ZXS_182'),
    ('李晨宇', 'ZXS_183'),
    ('彭奕恺', 'ZXS_184'),
    ('陶君笙', 'ZXS_185'),
    ('刘姝言', 'ZXS_186'),
    ('豊島美玲', 'ZXS_187'),
    ('胡妙言', 'ZXS_188'),
    ('李蹊', 'ZXS_189'),
    ('章湘粤', 'ZXS_190'),
    ('吕鹤', 'ZXS_191'),
    ('张晶琪', 'ZXS_192'),
    ('刘乃硕', 'ZXS_193'),
    ('蔡佳情', 'ZXS_194'),
    ('龙菁', 'ZXS_195'),
    ('叶一达', 'ZXS_196'),
    ('黄佳茗', 'ZXS_197'),
    ('王智丞', 'ZXS_198'),
    ('袁弘洋', 'ZXS_199'),
    ('李嘉童', 'ZXS_200'),
    ('戚晏瑄', 'ZXS_201'),
    ('杨晨曦', 'ZXS_202'),
    ('谭鑫', 'ZXS_203'),
    ('王锐骐', 'ZXS_204'),
    ('王子铭', 'ZXS_205'),
    ('黄欣', 'ZXS_206'),
    ('黄毅钧', 'ZXS_207'),
    ('周铭申', 'ZXS_208'),
    ('姚锦梓', 'ZXS_209'),
    ('徐荣华', 'ZXS_210'),
    ('于永昊', 'ZXS_211'),
    ('陆则宇', 'ZXS_212'),
    ('Ayaan', 'ZXS_213'),
    ('段天祺', 'ZXS_214'),
    ('米迪吴', 'ZXS_215'),
    ('崔渊哲', 'ZXS_216'),
    ('万珺', 'ZXS_217'),
    ('杜一真', 'ZXS_218'),
    ('严桢悦', 'ZXS_219'),
    ('徐杨', 'ZXS_220'),
    ('段旭琰', 'ZXS_221'),
    ('高与杨', 'ZXS_222'),
    ('葛班朵', 'ZXS_223'),
    ('卫翔宇', 'ZXS_224'),
    ('梁鸿鹄', 'ZXS_225'),
    ('张晗', 'ZXS_226'),
    ('金川', 'ZXS_227'),
    ('潘奕潼', 'ZXS_228'),
    ('朱亦凡', 'ZXS_229'),
    ('韩潇笛', 'ZXS_230'),
    ('胡姝欣', 'ZXS_231'),
    ('李翔', 'ZXS_232'),
    ('张润东', 'ZXS_233'),
    ('叶泓毅', 'ZXS_234'),
    ('黄欣怡', 'ZXS_235'),
    ('刘芊蕊', 'ZXS_236'),
    ('王柯', 'ZXS_237'),
    ('何嘉玮', 'ZXS_238'),
    ('徐婧弦', 'ZXS_239'),
    ('熊晓鸽', 'ZXS_240'),
    ('夏子涵', 'ZXS_241'),
    ('李月荣', 'ZXS_242'),
    ('英妤玥', 'ZXS_243'),
    ('李书承', 'ZXS_244'),
    ('白程紫璟', 'ZXS_245'),
    ('王晟垚', 'ZXS_246'),
    ('张玥', 'ZXS_247');
$roster$;

CREATE OR REPLACE FUNCTION private.member_number_canonical(p_number text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $function$
DECLARE
  v_number text := upper(NULLIF(btrim(p_number), ''));
  v_digits text;
BEGIN
  IF v_number IS NULL OR v_number !~ '^ZXS_[0-9]{3,}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_NUMBER_INVALID';
  END IF;
  v_digits := ltrim(substring(v_number FROM 5), '0');
  IF v_digits = '' THEN v_digits := '0'; END IF;
  IF char_length(v_digits) > 18 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_NUMBER_INVALID';
  END IF;
  RETURN 'ZXS_' || CASE WHEN char_length(v_digits) < 3 THEN lpad(v_digits, 3, '0') ELSE v_digits END;
END;
$function$;

CREATE SEQUENCE IF NOT EXISTS private.member_number_sequence
  AS bigint MINVALUE 1 MAXVALUE 999999999999999999 START WITH 248 NO CYCLE;

-- Values retained by pre-existing audit events are included, even if an account
-- is now anonymous or deleted. Names/contact details are not used for this ledger.
CREATE OR REPLACE FUNCTION private.member_number_max_issued()
RETURNS bigint
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT greatest(247::bigint, COALESCE(max(substring(normalized.number FROM 5)::bigint), 0))
  FROM (
    SELECT upper(btrim(member.member_number)) AS number FROM public.members AS member
    UNION ALL
    SELECT upper(btrim(number.value))
    FROM private.member_profile_audit_log AS audit
    CROSS JOIN LATERAL (VALUES
      (audit.before_values->>'member_number'),
      (audit.after_values->>'member_number'),
      (audit.metadata->>'member_number')
    ) AS number(value)
  ) AS value
  CROSS JOIN LATERAL (
    SELECT CASE WHEN value.number ~ '^ZXS_[0-9]{3,}$'
      AND char_length(ltrim(substring(value.number FROM 5), '0')) <= 18
      THEN private.member_number_canonical(value.number) END AS number
  ) AS normalized;
$function$;

CREATE OR REPLACE FUNCTION private.member_number_history_contains(p_number text)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM private.member_profile_audit_log AS audit
    CROSS JOIN LATERAL (VALUES
      (audit.before_values->>'member_number'),
      (audit.after_values->>'member_number'),
      (audit.metadata->>'member_number')
    ) AS number(value)
    WHERE CASE WHEN upper(btrim(number.value)) ~ '^ZXS_[0-9]{3,}$'
      AND char_length(ltrim(substring(upper(btrim(number.value)) FROM 5), '0')) <= 18
      THEN private.member_number_canonical(number.value) END = p_number
  );
$function$;

CREATE OR REPLACE FUNCTION private.member_number_next()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_last bigint;
  v_called boolean;
  v_high bigint;
  v_next bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('membership_number_allocation', 0));
  SELECT last_value, is_called INTO v_last, v_called FROM private.member_number_sequence;
  v_high := greatest(private.member_number_max_issued(), CASE WHEN v_called THEN v_last ELSE v_last - 1 END);
  IF v_high >= 999999999999999999 THEN
    RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'MEMBER_NUMBER_EXHAUSTED';
  END IF;
  PERFORM setval('private.member_number_sequence'::regclass, v_high, true);
  v_next := nextval('private.member_number_sequence'::regclass);
  RETURN 'ZXS_' || CASE WHEN v_next < 1000 THEN lpad(v_next::text, 3, '0') ELSE v_next::text END;
END;
$function$;

CREATE OR REPLACE FUNCTION private.member_number_validate(
  p_member_id uuid, p_number text, p_full_name text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_number text := private.member_number_canonical(p_number);
  v_reserved_name text;
  v_current text;
  v_same_current boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('membership_number_allocation', 0));
  SELECT member.member_number INTO v_current FROM public.members AS member WHERE member.id = p_member_id;
  IF v_current IS NOT NULL THEN
    IF upper(btrim(v_current)) ~ '^ZXS_[0-9]{3,}$' THEN
      IF char_length(ltrim(substring(upper(btrim(v_current)) FROM 5), '0')) <= 18 THEN
        v_same_current := private.member_number_canonical(v_current) = v_number;
      END IF;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.members AS member WHERE member.id <> p_member_id
      AND CASE WHEN upper(btrim(member.member_number)) ~ '^ZXS_[0-9]{3,}$'
        AND char_length(ltrim(substring(upper(btrim(member.member_number)) FROM 5), '0')) <= 18
        THEN private.member_number_canonical(member.member_number) END = v_number
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NUMBER_TAKEN';
  END IF;
  IF v_same_current THEN RETURN v_number; END IF;
  SELECT roster.full_name INTO v_reserved_name FROM private.member_number_roster() AS roster WHERE roster.member_number = v_number;
  IF v_reserved_name IS NOT NULL AND btrim(COALESCE(p_full_name, '')) <> v_reserved_name THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NUMBER_RESERVED';
  END IF;
  IF private.member_number_history_contains(v_number) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NUMBER_RETIRED';
  END IF;
  RETURN v_number;
END;
$function$;

CREATE OR REPLACE FUNCTION private.member_number_log(
  p_member_id uuid, p_before text, p_after text, p_event text, p_origin text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid := private.member_master_current_admin_id();
  v_number text := CASE WHEN p_event = 'retired' THEN p_before ELSE p_after END;
BEGIN
  IF v_number IS NULL OR upper(btrim(v_number)) !~ '^ZXS_[0-9]{3,}$' THEN RETURN; END IF;
  IF char_length(ltrim(substring(upper(btrim(v_number)) FROM 5), '0')) > 18 THEN RETURN; END IF;
  v_number := private.member_number_canonical(v_number);
  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source,
    actor_user_id, actor_admin_id, actor_name, metadata
  ) VALUES (
    CASE WHEN EXISTS (SELECT 1 FROM public.members AS member WHERE member.id = p_member_id) THEN p_member_id ELSE NULL END,
    p_member_id, 'member_lifecycle_update', 'account', ARRAY['member_number']::text[],
    jsonb_build_object('member_number', p_before), jsonb_build_object('member_number', p_after),
    COALESCE(NULLIF(current_setting('app.member_master_audit_reason', true), ''), CASE WHEN p_event = 'retired' THEN '会员编号保留，不再分配' ELSE '会员编号后台分配或调整' END),
    CASE WHEN current_setting('app.member_master_audit_source', true) = 'migration' THEN 'migration' ELSE 'system' END,
    (SELECT auth.uid()), v_admin_id,
    (SELECT administrator.name FROM public.admin_users AS administrator WHERE administrator.id = v_admin_id),
    jsonb_build_object('member_number_event', p_event, 'member_number', v_number,
      'member_number_origin', p_origin, 'offline_roster_version', '2026-10-06')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.member_number_before_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_name text;
  v_number text;
  v_origin text := 'manual';
  v_last bigint;
  v_called boolean;
  v_numeric bigint;
BEGIN
  IF NEW.record_scope <> 'current' OR NEW.record_source IN ('legacy', 'import') THEN RETURN NEW; END IF;
  -- Existing RPCs lock this member row before entering here. Keep that ordering:
  -- member row first, allocation advisory lock second, never lock another member.
  PERFORM pg_advisory_xact_lock(hashtextextended('membership_number_allocation', 0));
  IF NEW.account_status = 'closed' OR NEW.anonymized_at IS NOT NULL THEN
    IF TG_OP = 'UPDATE' AND NEW.member_number IS NOT NULL AND NEW.member_number IS DISTINCT FROM OLD.member_number THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NUMBER_ACCOUNT_CLOSED';
    END IF;
    RETURN NEW;
  END IF;
  SELECT identity.full_name INTO v_name FROM public.member_identity AS identity WHERE identity.member_id = NEW.id;
  IF TG_OP = 'UPDATE' AND OLD.member_number IS NOT NULL AND NEW.member_number IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_NUMBER_INVALID';
  END IF;
  IF NEW.member_number IS NULL AND NULLIF(btrim(v_name), '') IS NOT NULL THEN
    SELECT roster.member_number INTO v_number FROM private.member_number_roster() AS roster WHERE roster.full_name = btrim(v_name);
    IF v_number IS NULL THEN
      v_number := private.member_number_next(); v_origin := 'automatic';
    ELSE
      v_origin := 'offline_roster';
    END IF;
    NEW.member_number := v_number;
  END IF;
  IF NEW.member_number IS NOT NULL THEN
    NEW.member_number := private.member_number_canonical(NEW.member_number);
    IF TG_OP = 'INSERT' OR NEW.member_number IS DISTINCT FROM OLD.member_number THEN
      NEW.member_number := private.member_number_validate(NEW.id, NEW.member_number, v_name);
      v_numeric := substring(NEW.member_number FROM 5)::bigint;
      SELECT last_value, is_called INTO v_last, v_called FROM private.member_number_sequence;
      IF v_numeric > (CASE WHEN v_called THEN v_last ELSE v_last - 1 END) THEN
        PERFORM setval('private.member_number_sequence'::regclass, v_numeric, true);
      END IF;
    END IF;
  END IF;
  PERFORM set_config('app.member_number_origin', v_origin, true);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.member_number_audit_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_before text := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.member_number END;
  v_after text := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.member_number END;
  v_scope text := CASE WHEN TG_OP = 'DELETE' THEN OLD.record_scope ELSE NEW.record_scope END;
  v_origin text := COALESCE(NULLIF(current_setting('app.member_number_origin', true), ''), 'manual');
BEGIN
  IF v_scope <> 'current' THEN RETURN NULL; END IF;
  -- This audit deliberately ignores member_master_skip_member_audit. Anonymize
  -- and restore RPCs set that flag, but must never erase the number reservation.
  IF v_before IS DISTINCT FROM v_after THEN
    IF v_before IS NOT NULL THEN PERFORM private.member_number_log(v_member_id, v_before, v_after, 'retired', v_origin); END IF;
    IF v_after IS NOT NULL THEN PERFORM private.member_number_log(v_member_id, v_before, v_after, 'allocated', v_origin); END IF;
  ELSIF TG_OP = 'UPDATE' AND v_after IS NOT NULL AND (
    (OLD.account_status IS DISTINCT FROM NEW.account_status AND NEW.account_status IN ('closed', 'suspended'))
    OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'inactive')
    OR (OLD.anonymized_at IS NULL AND NEW.anonymized_at IS NOT NULL)
  ) THEN
    PERFORM private.member_number_log(v_member_id, v_before, v_after, 'retired', 'account_lifecycle');
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION private.member_number_on_identity_saved()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_member public.members%ROWTYPE;
BEGIN
  IF NULLIF(btrim(NEW.full_name), '') IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_member FROM public.members AS member WHERE member.id = NEW.member_id FOR UPDATE;
  IF v_member.record_scope = 'current' AND v_member.record_source NOT IN ('legacy', 'import')
     AND v_member.account_status NOT IN ('closed', 'suspended') AND v_member.anonymized_at IS NULL
     AND v_member.member_number IS NULL THEN
    UPDATE public.members SET member_number = NULL WHERE id = NEW.member_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER member_number_before_write
  BEFORE INSERT OR UPDATE OF member_number, status, account_status, anonymized_at, record_scope, record_source
  ON public.members FOR EACH ROW EXECUTE FUNCTION private.member_number_before_write();
CREATE TRIGGER member_number_audit_change
  AFTER INSERT OR UPDATE OF member_number, status, account_status, anonymized_at OR DELETE
  ON public.members FOR EACH ROW EXECUTE FUNCTION private.member_number_audit_change();
CREATE TRIGGER member_number_on_identity_saved
  AFTER INSERT OR UPDATE OF full_name ON public.member_identity
  FOR EACH ROW EXECUTE FUNCTION private.member_number_on_identity_saved();

-- Keep the legacy admin_update_member_number RPC disabled. Existing versioned
-- admin_update_member_section(account) stays the sole frontend write API; the
-- members trigger also guards privileged restores/direct writes.
-- Every helper is private and unavailable through the public Data API.
REVOKE ALL ON FUNCTION private.member_number_roster() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_number_canonical(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_number_max_issued() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_number_history_contains(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_number_next() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_number_validate(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_number_log(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_number_before_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_number_audit_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_number_on_identity_saved() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE private.member_number_sequence FROM PUBLIC, anon, authenticated, service_role;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT roster.full_name FROM private.member_number_roster() AS roster
    JOIN public.member_identity AS identity ON btrim(identity.full_name) = roster.full_name
    JOIN public.members AS member ON member.id = identity.member_id
    WHERE member.record_scope = 'current' AND member.record_source NOT IN ('legacy','import')
      AND member.account_status <> 'closed' AND member.anonymized_at IS NULL
    GROUP BY roster.full_name HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'MEMBER_NUMBER_BACKFILL_NAME_CONFLICT'; END IF;
  IF EXISTS (
    SELECT 1 FROM private.member_number_roster() AS roster
    JOIN public.member_identity AS identity ON btrim(identity.full_name) = roster.full_name
    JOIN public.members AS member ON member.id = identity.member_id
    JOIN public.members AS occupant ON occupant.member_number = roster.member_number AND occupant.id <> member.id
    WHERE member.record_scope = 'current' AND member.record_source NOT IN ('legacy','import')
      AND member.account_status <> 'closed' AND member.anonymized_at IS NULL
  ) THEN RAISE EXCEPTION 'MEMBER_NUMBER_BACKFILL_NUMBER_CONFLICT'; END IF;
END;
$preflight$;

SELECT set_config('app.member_master_audit_source', 'migration', true);
SELECT set_config('app.member_master_audit_reason', '按线下247人名单校正会员编号，并建立不可复用编号分配规则', true);
-- One-time, explicitly reviewed legacy data correction. Before this feature,
-- the official account briefly received 001 and was corrected to its real 000.
-- The offline roster assigns 001 to Chen Feng. Preserve both original audit
-- records; do not classify a proven mistaken entry as a real retired membership.
-- This block never creates a reusable runtime bypass: only one known target
-- row is written, with the existing table locks and unique/lifecycle/audit guards.
DO $initial_official_number_correction$
DECLARE
  v_history_ids bigint[];
  v_updated integer;
  v_previous_origin text := COALESCE(current_setting('app.member_number_origin', true), '');
BEGIN
  -- Fresh installations/test fixtures without either known historical event
  -- take the ordinary allocation path. If any known event is present, all
  -- evidence below must agree; partial or changed evidence fails closed.
  IF NOT EXISTS (
    SELECT 1 FROM private.member_profile_audit_log AS audit
    WHERE audit.id IN (1333, 1334)
      AND audit.member_id_snapshot = 'f049f125-e2c2-42ac-b0e7-096592c62d2b'::uuid
  ) THEN RETURN; END IF;

  SELECT array_agg(DISTINCT audit.id ORDER BY audit.id) INTO v_history_ids
  FROM private.member_profile_audit_log AS audit
  CROSS JOIN LATERAL (VALUES
    (audit.before_values->>'member_number'),
    (audit.after_values->>'member_number'),
    (audit.metadata->>'member_number')
  ) AS number(value)
  WHERE CASE WHEN upper(btrim(number.value)) ~ '^ZXS_[0-9]{3,}$'
    AND char_length(ltrim(substring(upper(btrim(number.value)) FROM 5), '0')) <= 18
    THEN private.member_number_canonical(number.value) END = 'ZXS_001';

  -- The legacy unique index compares text. Retain the runtime validator's
  -- canonical collision check even while its BEFORE trigger is paused.
  IF EXISTS (
    SELECT 1 FROM public.members AS member
    WHERE CASE WHEN upper(btrim(member.member_number)) ~ '^ZXS_[0-9]{3,}$'
      AND char_length(ltrim(substring(upper(btrim(member.member_number)) FROM 5), '0')) <= 18
      THEN private.member_number_canonical(member.member_number) END = 'ZXS_001'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NUMBER_TAKEN';
  END IF;

  IF v_history_ids IS DISTINCT FROM ARRAY[1333, 1334]::bigint[]
     OR NOT EXISTS (
       SELECT 1 FROM private.member_profile_audit_log AS audit
       WHERE audit.id = 1333
         AND audit.member_id_snapshot = 'f049f125-e2c2-42ac-b0e7-096592c62d2b'::uuid
         AND audit.action_type = 'admin_section_update'
         AND audit.section = 'account' AND audit.source = 'admin'
         AND audit.created_at = '2026-10-06 10:28:44.305585+00'::timestamptz
         AND audit.before_values->>'member_number' = '竹溪社-001'
         AND audit.after_values->>'member_number' = 'ZXS_001'
         AND audit.metadata->>'member_number_event' IS NULL
         AND audit.metadata->>'member_number' IS NULL
     ) OR NOT EXISTS (
       SELECT 1 FROM private.member_profile_audit_log AS audit
       WHERE audit.id = 1334
         AND audit.member_id_snapshot = 'f049f125-e2c2-42ac-b0e7-096592c62d2b'::uuid
         AND audit.action_type = 'admin_section_update'
         AND audit.section = 'account' AND audit.source = 'admin'
         AND audit.created_at = '2026-10-06 10:31:03.401176+00'::timestamptz
         AND audit.before_values->>'member_number' = 'ZXS_001'
         AND audit.after_values->>'member_number' = 'ZXS_000'
         AND audit.metadata->>'member_number_event' IS NULL
         AND audit.metadata->>'member_number' IS NULL
     ) OR NOT EXISTS (
       SELECT 1 FROM public.members AS member
       JOIN public.member_identity AS identity ON identity.member_id = member.id
       WHERE member.id = 'f049f125-e2c2-42ac-b0e7-096592c62d2b'::uuid
         AND member.record_scope = 'current' AND member.record_source NOT IN ('legacy', 'import')
         AND member.account_status = 'active' AND member.status = 'approved'
         AND member.anonymized_at IS NULL AND member.member_number = 'ZXS_000'
         AND btrim(identity.full_name) = '竹溪社'
     ) OR NOT EXISTS (
       SELECT 1 FROM public.members AS member
       JOIN public.member_identity AS identity ON identity.member_id = member.id
       JOIN private.member_number_roster() AS roster ON roster.full_name = btrim(identity.full_name)
       WHERE member.id = 'a93fae7f-693b-4d6e-acd2-59e238cb0787'::uuid
         AND member.record_scope = 'current' AND member.record_source NOT IN ('legacy', 'import')
         AND member.account_status = 'active' AND member.status = 'approved'
         AND member.anonymized_at IS NULL AND member.member_number IS NULL
         AND btrim(identity.full_name) = '陈风' AND roster.member_number = 'ZXS_001'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NUMBER_RETIRED';
  END IF;

  PERFORM set_config('app.member_number_origin', 'offline_roster_legacy_correction', true);
  ALTER TABLE public.members DISABLE TRIGGER member_number_before_write;
  UPDATE public.members SET member_number = 'ZXS_001'
  WHERE id = 'a93fae7f-693b-4d6e-acd2-59e238cb0787'::uuid AND member_number IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  ALTER TABLE public.members ENABLE TRIGGER member_number_before_write;
  PERFORM set_config('app.member_number_origin', v_previous_origin, true);
  IF v_updated <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NUMBER_RETIRED';
  END IF;

  INSERT INTO private.member_profile_audit_log (
    member_id, member_id_snapshot, action_type, section, changed_fields,
    before_values, after_values, reason, source, metadata
  ) VALUES (
    'a93fae7f-693b-4d6e-acd2-59e238cb0787'::uuid,
    'a93fae7f-693b-4d6e-acd2-59e238cb0787'::uuid,
    'member_lifecycle_update', 'account', ARRAY['member_number']::text[],
    jsonb_build_object('member_number', NULL), jsonb_build_object('member_number', 'ZXS_001'),
    '按线下名单纠正官方账号短暂误录的001归属；保留原始审计1333和1334，不放行其他退役编号',
    'migration', jsonb_build_object(
      'member_number_event', 'legacy_assignment_correction',
      'member_number', 'ZXS_001', 'offline_roster_version', '2026-10-06',
      'corrected_error_audit_ids', jsonb_build_array(1333, 1334),
      'corrected_error_member_id_snapshot', 'f049f125-e2c2-42ac-b0e7-096592c62d2b',
      'correction_scope', 'one_time_initial_offline_roster_backfill'
    )
  );
END;
$initial_official_number_correction$;

DO $backfill$
DECLARE
  v_member record;
  v_high bigint;
BEGIN
  -- Capture existing canonical numbers before any correction/clearing can occur.
  FOR v_member IN SELECT member.id, member.member_number FROM public.members AS member
    WHERE member.record_scope = 'current' AND member.member_number ~ '^ZXS_[0-9]{3,18}$'
  LOOP
    PERFORM private.member_number_log(v_member.id, NULL, v_member.member_number, 'allocated', 'existing_number_baseline');
  END LOOP;
  v_high := private.member_number_max_issued();
  PERFORM setval('private.member_number_sequence'::regclass, v_high, true);

  UPDATE public.members AS member SET member_number = roster.member_number
  FROM public.member_identity AS identity, private.member_number_roster() AS roster
  WHERE identity.member_id = member.id AND btrim(identity.full_name) = roster.full_name
    AND member.record_scope = 'current' AND member.record_source NOT IN ('legacy','import')
    AND member.account_status <> 'closed' AND member.anonymized_at IS NULL
    AND member.member_number IS DISTINCT FROM roster.member_number;

  UPDATE public.members AS member SET member_number = private.member_number_canonical(member.member_number)
  WHERE member.record_scope = 'current' AND member.record_source NOT IN ('legacy','import')
    AND member.account_status <> 'closed' AND member.anonymized_at IS NULL
    AND upper(btrim(member.member_number)) ~ '^ZXS_[0-9]{3,18}$'
    AND member.member_number IS DISTINCT FROM CASE WHEN upper(btrim(member.member_number)) ~ '^ZXS_[0-9]{3,18}$' THEN private.member_number_canonical(member.member_number) ELSE member.member_number END;

  -- The original insert timestamp is a documented fallback only where no
  -- successful first-name-save audit exists; it is never represented as exact.
  FOR v_member IN
    SELECT member.id, member.member_number,
      first_save.saved_at, identity.created_at AS identity_created_at
    FROM public.members AS member JOIN public.member_identity AS identity ON identity.member_id = member.id
    LEFT JOIN LATERAL (
      SELECT min(audit.created_at) AS saved_at FROM private.member_profile_audit_log AS audit
      WHERE audit.member_id_snapshot = member.id
        AND NULLIF(btrim(audit.after_values->>'full_name'), '') IS NOT NULL
        AND (audit.section IN ('identity','onboarding_step_1') OR audit.action_type = 'onboarding_step_saved')
    ) AS first_save ON true
    WHERE member.record_scope = 'current' AND member.record_source NOT IN ('legacy','import')
      AND member.account_status <> 'closed' AND member.anonymized_at IS NULL
      AND NULLIF(btrim(identity.full_name), '') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM private.member_number_roster() AS roster WHERE roster.full_name = btrim(identity.full_name))
      AND (member.member_number IS NULL OR upper(btrim(member.member_number)) !~ '^ZXS_[0-9]{3,18}$')
    ORDER BY COALESCE(first_save.saved_at, identity.created_at), member.id
  LOOP
    UPDATE public.members SET member_number = private.member_number_next() WHERE id = v_member.id;
    INSERT INTO private.member_profile_audit_log (
      member_id,member_id_snapshot,action_type,section,changed_fields,before_values,after_values,source,metadata
    ) VALUES (
      v_member.id,v_member.id,'member_lifecycle_update','account',ARRAY['member_number'],
      jsonb_build_object('member_number',v_member.member_number),
      (SELECT jsonb_build_object('member_number',member.member_number) FROM public.members AS member WHERE member.id=v_member.id),
      'migration',jsonb_build_object('member_number_backfill_order_source',
        CASE WHEN v_member.saved_at IS NOT NULL THEN 'first_name_save_audit' ELSE 'identity_created_at_fallback' END)
    );
  END LOOP;
END;
$backfill$;

ALTER TABLE public.members ADD CONSTRAINT members_current_member_number_format_check CHECK (
  record_scope <> 'current' OR record_source IN ('legacy','import') OR account_status = 'closed' OR anonymized_at IS NOT NULL OR member_number IS NULL
  OR member_number ~ '^ZXS_[0-9]{3,18}$'
);
DO $enabled_number_guards$
BEGIN
  IF (SELECT count(*) FROM pg_trigger AS trigger_info
      WHERE (trigger_info.tgrelid, trigger_info.tgname) IN (
        ('public.members'::regclass, 'member_number_before_write'),
        ('public.members'::regclass, 'member_number_audit_change'),
        ('public.member_identity'::regclass, 'member_number_on_identity_saved')
      ) AND trigger_info.tgenabled = 'O') <> 3 THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_GUARD_DISABLED';
  END IF;
END;
$enabled_number_guards$;

COMMENT ON SEQUENCE private.member_number_sequence IS
  'Membership allocation high-water mark; never reset on account closure/anonymization or manual correction.';
COMMIT;
