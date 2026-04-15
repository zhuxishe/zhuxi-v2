import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { DEGREE_MAP, GENDER_MAP, ProfileData, STATUS_MAP, unwrap } from './profile-data'

export function ProfileSections({ profile }: { profile: ProfileData }) {
  const identity = unwrap(profile.member_identity)
  const lang = unwrap(profile.member_language)
  const interests = unwrap(profile.member_interests)
  const personality = unwrap(profile.member_personality)
  const quiz = unwrap(profile.personality_quiz_results)

  return (
    <>
      <View className="card">
        <CardHeader title="基本信息" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-identity' })} />
        <InfoRow label="会员编号" value={profile.member_number || '待分配'} />
        <InfoRow label="状态" value={STATUS_MAP[profile.status] || profile.status} />
        {identity ? (
          <>
            <InfoRow label="姓名" value={identity.full_name || '-'} />
            <InfoRow label="昵称" value={identity.nickname || '-'} />
            <InfoRow label="性别" value={GENDER_MAP[identity.gender || ''] || '-'} />
            <InfoRow label="年龄段" value={identity.age_range || '-'} />
            <InfoRow label="学校" value={identity.school_name || '-'} />
            <InfoRow label="专业" value={identity.department || '-'} />
            {identity.degree_level && <InfoRow label="学历" value={DEGREE_MAP[identity.degree_level] || identity.degree_level} />}
            {identity.course_language && <InfoRow label="授课语言" value={identity.course_language} />}
            {identity.enrollment_year && <InfoRow label="入学年份" value={String(identity.enrollment_year)} />}
          </>
        ) : <Text className="hint">尚未填写身份信息</Text>}
      </View>

      <View className="card">
        <CardHeader title="语言" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-language' })} />
        {lang ? (
          <>
            <InfoRow label="日语水平" value={lang.japanese_level || '-'} />
            <InfoRow label="沟通语言" value={lang.communication_language_pref?.join(', ') || '-'} />
          </>
        ) : <Text className="hint">尚未填写</Text>}
      </View>

      <View className="card">
        <CardHeader title="活动偏好" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-interests' })} />
        {interests ? (
          <>
            <InfoRow label="活动区域" value={interests.activity_area || '-'} />
            <InfoRow label="活动频率" value={interests.activity_frequency || '-'} />
            <InfoRow label="玩本类型" value={interests.game_type_pref || '-'} />
            <InfoRow label="剧本类型" value={interests.scenario_mode_pref?.join(', ') || '-'} />
          </>
        ) : <Text className="hint">尚未填写</Text>}
      </View>

      <View className="card">
        <CardHeader title="时间/预算/偏好" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-more-interests' })} />
        {interests?.budget_range || interests?.preferred_time_slots?.length ? (
          <>
            {interests.budget_range && <InfoRow label="预算" value={interests.budget_range} />}
            {interests.preferred_time_slots?.length ? <InfoRow label="时段" value={interests.preferred_time_slots.join(', ')} /> : null}
            {interests.ideal_group_size ? <InfoRow label="理想人数" value={interests.ideal_group_size} /> : null}
            {interests.travel_radius ? <InfoRow label="通勤半径" value={interests.travel_radius} /> : null}
            {interests.script_preference?.length ? <InfoRow label="剧本偏好" value={interests.script_preference.join(', ')} /> : null}
            {interests.non_script_preference?.length ? <InfoRow label="非剧本活动" value={interests.non_script_preference.join(', ')} /> : null}
          </>
        ) : <Text className="hint">人数、时段、预算、剧本偏好等</Text>}
      </View>

      <View className="card">
        <CardHeader title="个人标签" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-tags' })} />
        {identity?.personality_self_tags?.length || identity?.hobby_tags?.length || identity?.activity_type_tags?.length || identity?.taboo_tags?.length ? (
          <>
            {identity.hobby_tags?.length ? <InfoRow label="兴趣爱好" value={identity.hobby_tags.join(', ')} /> : null}
            {identity.activity_type_tags?.length ? <InfoRow label="活动类型" value={identity.activity_type_tags.join(', ')} /> : null}
            {identity.personality_self_tags?.length ? <InfoRow label="性格标签" value={identity.personality_self_tags.join(', ')} /> : null}
            <InfoRow label="禁忌边界" value={identity?.taboo_tags?.join(', ') || '-'} />
          </>
        ) : <Text className="hint">尚未填写</Text>}
      </View>

      <View className="card">
        <CardHeader title="性格画像" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit-personality' })} />
        {personality ? (
          <>
            <InfoRow label="表达风格" value={personality.expression_style_tags?.join(', ') || '-'} />
            <InfoRow label="群体角色" value={personality.group_role_tags?.join(', ') || '-'} />
            <InfoRow label="熟络节奏" value={personality.warmup_speed || '-'} />
            <InfoRow label="计划性" value={personality.planning_style || '-'} />
            <InfoRow label="合作竞技倾向" value={personality.coop_compete_tendency || '-'} />
            <ScoreRow label="外向程度" value={personality.extroversion} />
            <ScoreRow label="主动性" value={personality.initiative} />
            <ScoreRow label="情绪稳定" value={personality.emotional_stability} />
            <InfoRow label="边界强度" value={personality.boundary_strength || '-'} />
            <InfoRow label="回复节奏" value={personality.reply_speed || '-'} />
          </>
        ) : <Text className="hint">尚未填写</Text>}
      </View>

      <View className="card">
        <CardHeader title="性格测试 (Big Five)" onEdit={() => Taro.navigateTo({ url: '/pages/quiz/index' })} />
        {quiz && quiz.score_e != null ? (
          <View className="quiz-scores">
            {quiz.personality_type ? <View className="type-badge"><Text className="type-badge-text">{quiz.personality_type}</Text></View> : null}
            <ScoreBar label="外向性 E" score={quiz.score_e} />
            <ScoreBar label="宜人性 A" score={quiz.score_a} />
            <ScoreBar label="开放性 O" score={quiz.score_o} />
            <ScoreBar label="尽责性 C" score={quiz.score_c} />
            <ScoreBar label="神经质 N" score={quiz.score_n} />
          </View>
        ) : (
          <View className="quiz-cta" onClick={() => Taro.navigateTo({ url: '/pages/quiz/index' })}>
            <Text className="quiz-cta-text">去测试</Text>
          </View>
        )}
      </View>
    </>
  )
}

function CardHeader({ title, onEdit }: { title: string; onEdit?: () => void }) {
  return <View className="card-header"><Text className="card-title">{title}</Text>{onEdit && <Text className="edit-link" onClick={onEdit}>编辑</Text>}</View>
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return <View className="info-row"><Text className="info-label">{label}</Text><Text className="info-value">{value}</Text></View>
}
function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return <View className="info-row"><Text className="info-label">{label}</Text><View className="score-dots">{[1, 2, 3, 4, 5].map(i => <View key={i} className={`dot ${i <= (value || 0) ? 'active' : ''}`} />)}</View></View>
}
function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const pct = Math.min(100, Math.max(0, score || 0))
  return <View className="score-bar-row"><Text className="score-label">{label}</Text><View className="bar-bg"><View className="bar-fill" style={{ width: `${pct}%` }} /></View><Text className="score-num">{score || 0}</Text></View>
}
