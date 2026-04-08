import { View, Text, Picker, Input, Switch } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import './edit-more-interests.scss'

const GROUP_SIZES = ['2人', '3-4人', '4-5人', '6-7人', '8-10人', '10人以上', '都可以']
const SCRIPT_PREFS = ['新本', '经典本', '城限本', '独家本', '都可以']
const NON_SCRIPT_PREFS = ['桌游', '聚餐', 'KTV', '运动', '旅行', '展览', '读书会', '其他']
const TIME_SLOTS = [
  '工作日白天', '工作日晚间', '周五晚',
  '周六白天', '周六晚', '周日白天', '周日晚',
  '节假日', '临时约也可',
]
const BUDGETS = ['~2000円', '2000~4000円', '4000~6000円', '6000円以上', '无所谓']
const GRAD_YEARS = ['2025', '2026', '2027', '2028', '2029', '2030']
const TRAVEL = ['30分钟以内', '1小时以内', '1~2小时', '都可以']
const SOCIAL_GOALS = [
  '认识新朋友', '找固定玩伴', '练习日语',
  '体验文化', '打发时间', '拓展社交圈',
  '找双人搭子', '找剧本杀搭子', '找旅行搭子',
]

export default function EditMoreInterests() {
  const [groupSize, setGroupSize] = useState('')
  const [scriptPref, setScriptPref] = useState<string[]>([])
  const [nonScriptPref, setNonScriptPref] = useState<string[]>([])
  const [timeSlots, setTimeSlots] = useState<string[]>([])
  const [budget, setBudget] = useState('')
  const [travel, setTravel] = useState('')
  const [socialGoal, setSocialGoal] = useState('')
  const [socialGoal2, setSocialGoal2] = useState('')
  const [nearestStation, setNearestStation] = useState('')
  const [gradYear, setGradYear] = useState('')
  const [acceptBeginners, setAcceptBeginners] = useState(true)
  const [acceptCrossSchool, setAcceptCrossSchool] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useDidShow(() => { loadData() })

  const loadData = async () => {
    try {
      const memberId = await getMemberId()
      const rows = await supabaseQuery<any[]>('member_interests', {
        select: 'ideal_group_size,script_preference,non_script_preference,preferred_time_slots,budget_range,travel_radius,social_goal_primary,social_goal_secondary,nearest_station,graduation_year,accept_beginners,accept_cross_school',
        member_id: `eq.${memberId}`,
      })
      if (rows?.length) {
        const d = rows[0]
        setGroupSize(d.ideal_group_size || '')
        setScriptPref(d.script_preference || [])
        setNonScriptPref(d.non_script_preference || [])
        setTimeSlots(d.preferred_time_slots || [])
        setBudget(d.budget_range || '')
        setTravel(d.travel_radius || '')
        setSocialGoal(d.social_goal_primary || '')
        setSocialGoal2(d.social_goal_secondary || '')
        setNearestStation(d.nearest_station || '')
        setGradYear(d.graduation_year ? String(d.graduation_year) : '')
        setAcceptBeginners(d.accept_beginners !== false)
        setAcceptCrossSchool(d.accept_cross_school !== false)
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggle = (list: string[], set: (v: string[]) => void, item: string) => {
    set(list.includes(item) ? list.filter(i => i !== item) : [...list, item])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const memberId = await getMemberId()
      await supabaseQuery('member_interests', { member_id: `eq.${memberId}` }, {
        method: 'PATCH',
        body: {
          ideal_group_size: groupSize || null,
          script_preference: scriptPref,
          non_script_preference: nonScriptPref,
          preferred_time_slots: timeSlots,
          budget_range: budget || null,
          travel_radius: travel || null,
          social_goal_primary: socialGoal || null,
          social_goal_secondary: socialGoal2 || null,
          nearest_station: nearestStation.trim() || null,
          graduation_year: gradYear ? Number(gradYear) : null,
          accept_beginners: acceptBeginners,
          accept_cross_school: acceptCrossSchool,
        },
      })
      Taro.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <View className="edit-page"><Text className="loading">加载中...</Text></View>
  }

  return (
    <View className="edit-page">
      <View className="form-card">
        <PickerRow label="理想人数" options={GROUP_SIZES} value={groupSize} onChange={setGroupSize} />
        <PickerRow label="预算范围" options={BUDGETS} value={budget} onChange={setBudget} />
        <PickerRow label="通勤半径" options={TRAVEL} value={travel} onChange={setTravel} />
        <PickerRow label="社交目标" options={SOCIAL_GOALS} value={socialGoal} onChange={setSocialGoal} />
        <PickerRow label="次要目标" options={SOCIAL_GOALS} value={socialGoal2} onChange={setSocialGoal2} />
        <PickerRow label="毕业年份" options={GRAD_YEARS} value={gradYear} onChange={setGradYear} />

        <View className="form-row">
          <Text className="form-label">最近车站</Text>
          <Input className="form-input" value={nearestStation} placeholder="例：新宿駅"
            onInput={e => setNearestStation(e.detail.value)} />
        </View>

        <View className="form-row">
          <Text className="form-label">接受新手</Text>
          <Switch checked={acceptBeginners} color="#3C6E47"
            onChange={e => setAcceptBeginners(e.detail.value)} />
        </View>
        <View className="form-row">
          <Text className="form-label">跨校活动</Text>
          <Switch checked={acceptCrossSchool} color="#3C6E47"
            onChange={e => setAcceptCrossSchool(e.detail.value)} />
        </View>

        <TagSection title="可用时段（可多选）" options={TIME_SLOTS} selected={timeSlots}
          onToggle={v => toggle(timeSlots, setTimeSlots, v)} />
        <TagSection title="剧本偏好（可多选）" options={SCRIPT_PREFS} selected={scriptPref}
          onToggle={v => toggle(scriptPref, setScriptPref, v)} />
        <TagSection title="非剧本活动（可多选）" options={NON_SCRIPT_PREFS} selected={nonScriptPref}
          onToggle={v => toggle(nonScriptPref, setNonScriptPref, v)} />
      </View>

      <View className="save-btn" onClick={!saving ? handleSave : undefined}>
        <Text className="save-text">{saving ? '保存中...' : '保存'}</Text>
      </View>
    </View>
  )
}

function PickerRow({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <Picker mode="selector" range={options} value={options.indexOf(value)}
      onChange={e => onChange(options[e.detail.value as number])}>
      <View className="form-row">
        <Text className="form-label">{label}</Text>
        <Text className={`form-picker ${value ? '' : 'placeholder'}`}>{value || '请选择'}</Text>
      </View>
    </Picker>
  )
}

function TagSection({ title, options, selected, onToggle }: {
  title: string; options: string[]; selected: string[]; onToggle: (v: string) => void
}) {
  return (
    <>
      <Text className="section-title">{title}</Text>
      <View className="tag-grid">
        {options.map(t => (
          <View key={t} className={`tag ${selected.includes(t) ? 'active' : ''}`}
            onClick={() => onToggle(t)}>
            <Text className="tag-text">{t}</Text>
          </View>
        ))}
      </View>
    </>
  )
}
