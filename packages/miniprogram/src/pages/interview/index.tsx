import { View, Text, Input, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import './index.scss'

const GENDER_OPTIONS = ['male', 'female', 'other']
const GENDER_LABELS = ['男', '女', '其他']
const AGE_OPTIONS = ['18以下', '18-20', '21-23', '24-26', '27-29', '30+']
const NATIONALITY_OPTIONS = ['中国大陆', '中国台湾', '中国香港', '中国澳门', '日本', '韩国', '其他亚洲', '其他']
const CITY_OPTIONS = ['东京都', '神奈川县', '千叶县', '埼玉县', '其他']
const DEGREE_OPTIONS = ['undergraduate', 'master', 'doctoral', 'exchange', 'language_school', 'other']
const DEGREE_LABELS = ['本科', '硕士', '博士', '交换生', '语言学校', '其他']
const COURSE_LANG = ['日语', '英语', '中文', '混合']
const ENROLL_YEARS = Array.from({ length: 11 }, (_, i) => String(2020 + i))

const HOBBY_TAGS = [
  '剧本杀', '桌游', '咖啡探店', '美食', '旅行', '运动', '音乐', '电影',
  '动漫', '游戏', '读书', '摄影', '烹饪', '手工', '绘画', '舞蹈',
  '编程', '语言学习', '宠物', '户外活动', '瑜伽/冥想', '购物', '志愿活动', '其他',
]
const ACTIVITY_TYPES = [
  '剧本杀', '桌游', '聚餐', '咖啡', '城市散步', '看展', '观影',
  'K歌', '运动', '旅行', 'TRPG', '密室逃脱', '志愿活动', '其他',
]
const PERSONALITY_TAGS = ['外向', '内向', '社牛', '社恐', '慢热', '幽默', '认真', '温和', '直率', '活泼']
const TABOO_TAGS = [
  '迟到爽约', '临时变卦', '强行劝酒', '室内吸烟', '过度肢体接触', '过度打探隐私', '偷拍',
  '恋爱导向过强', '借钱/推销', '酒后失控', '脏话攻击', '情绪输出过强',
  '私人空间局', '单独异性局', '临时加人', '过远通勤',
  '不接受恐怖内容', '不接受高压竞争', '无明显禁忌', '其他',
]

const STEPS = ['基本信息', '学业信息', '兴趣标签', '性格自评']

export default function Interview() {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    full_name: '', nickname: '', gender: '', age_range: '', nationality: '', current_city: '',
    school_name: '', department: '', degree_level: '', course_language: '', enrollment_year: '',
    hobby_tags: [] as string[], activity_type_tags: [] as string[],
    personality_self_tags: [] as string[], taboo_tags: [] as string[],
  })

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
  const toggleTag = (k: string, tag: string, max?: number) => {
    const list = (form as Record<string, any>)[k] as string[]
    if (list.includes(tag)) set(k, list.filter(t => t !== tag))
    else if (!max || list.length < max) set(k, [...list, tag])
    else Taro.showToast({ title: `最多选${max}个`, icon: 'none' })
  }

  const validateStep = (): boolean => {
    if (step === 0) {
      if (!form.full_name.trim() || !form.gender || !form.age_range || !form.nationality || !form.current_city) {
        Taro.showToast({ title: '请填写所有必填项', icon: 'none' }); return false
      }
    }
    if (step === 2) {
      if (!form.hobby_tags.length) { Taro.showToast({ title: '请至少选择一个兴趣', icon: 'none' }); return false }
      if (!form.activity_type_tags.length) { Taro.showToast({ title: '请至少选择一个活动类型', icon: 'none' }); return false }
    }
    if (step === 3) {
      if (!form.personality_self_tags.length) { Taro.showToast({ title: '请至少选择一个性格标签', icon: 'none' }); return false }
    }
    return true
  }

  const nextStep = () => { if (validateStep()) setStep(step + 1) }
  const prevStep = () => { if (step > 0) setStep(step - 1) }

  const handleSubmit = async () => {
    if (!validateStep()) return
    setSubmitting(true)
    try {
      const memberId = await getMemberId()
      await supabaseQuery('member_identity', { on_conflict: 'member_id' }, {
        method: 'POST',
        body: {
          member_id: memberId,
          full_name: form.full_name.trim(),
          nickname: form.nickname.trim() || null,
          gender: form.gender, age_range: form.age_range,
          nationality: form.nationality, current_city: form.current_city,
          school_name: form.school_name.trim() || null,
          department: form.department.trim() || null,
          degree_level: form.degree_level || null,
          course_language: form.course_language || null,
          enrollment_year: form.enrollment_year ? Number(form.enrollment_year) : null,
          hobby_tags: form.hobby_tags, activity_type_tags: form.activity_type_tags,
          personality_self_tags: form.personality_self_tags, taboo_tags: form.taboo_tags,
        },
      })
      Taro.showToast({ title: '提交成功', icon: 'success' })
      setTimeout(() => Taro.switchTab({ url: '/pages/index/index' }), 800)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally { setSubmitting(false) }
  }

  return (
    <View className="interview-page">
      <View className="steps-bar">
        {STEPS.map((s, i) => (
          <View key={i} className={`step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}>
            <Text className="step-num">{i + 1}</Text>
          </View>
        ))}
      </View>
      <Text className="step-title">{STEPS[step]}</Text>

      <View className="form-card">
        {step === 0 && <Step0 form={form} set={set} />}
        {step === 1 && <Step1 form={form} set={set} />}
        {step === 2 && <Step2 form={form} toggleTag={toggleTag} />}
        {step === 3 && <Step3 form={form} toggleTag={toggleTag} />}
      </View>

      <View className="nav-row">
        {step > 0 && (
          <View className="nav-btn secondary" onClick={prevStep}>
            <Text className="nav-text secondary-text">上一步</Text>
          </View>
        )}
        {step < 3 ? (
          <View className="nav-btn primary" onClick={nextStep}>
            <Text className="nav-text primary-text">下一步</Text>
          </View>
        ) : (
          <View className="nav-btn primary" onClick={!submitting ? handleSubmit : undefined}>
            <Text className="nav-text primary-text">{submitting ? '提交中...' : '提交'}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

function Step0({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  return (
    <>
      <FInput label="姓名 *" value={form.full_name} placeholder="真实姓名" onInput={v => set('full_name', v)} />
      <FInput label="昵称" value={form.nickname} placeholder="可选" onInput={v => set('nickname', v)} />
      <FPicker label="性别 *" options={GENDER_LABELS} value={form.gender ? GENDER_LABELS[GENDER_OPTIONS.indexOf(form.gender)] : ''}
        onChange={i => set('gender', GENDER_OPTIONS[i])} />
      <FPicker label="年龄段 *" options={AGE_OPTIONS} value={form.age_range} onChange={i => set('age_range', AGE_OPTIONS[i])} />
      <FPicker label="国籍 *" options={NATIONALITY_OPTIONS} value={form.nationality} onChange={i => set('nationality', NATIONALITY_OPTIONS[i])} />
      <FPicker label="所在城市 *" options={CITY_OPTIONS} value={form.current_city} onChange={i => set('current_city', CITY_OPTIONS[i])} />
    </>
  )
}

function Step1({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  return (
    <>
      <FInput label="学校" value={form.school_name} placeholder="学校名称" onInput={v => set('school_name', v)} />
      <FInput label="专业" value={form.department} placeholder="专业/部门" onInput={v => set('department', v)} />
      <FPicker label="学历" options={DEGREE_LABELS} value={form.degree_level ? DEGREE_LABELS[DEGREE_OPTIONS.indexOf(form.degree_level)] : ''}
        onChange={i => set('degree_level', DEGREE_OPTIONS[i])} />
      <FPicker label="授课语言" options={COURSE_LANG} value={form.course_language} onChange={i => set('course_language', COURSE_LANG[i])} />
      <FPicker label="入学年份" options={ENROLL_YEARS} value={form.enrollment_year} onChange={i => set('enrollment_year', ENROLL_YEARS[i])} />
    </>
  )
}

function Step2({ form, toggleTag }: { form: any; toggleTag: (k: string, t: string, m?: number) => void }) {
  return (
    <>
      <Text className="section-title">兴趣爱好 *（最多8个）</Text>
      <Tags list={HOBBY_TAGS} selected={form.hobby_tags} onToggle={t => toggleTag('hobby_tags', t, 8)} />
      <Text className="section-title">想参加的活动 *（最多5个）</Text>
      <Tags list={ACTIVITY_TYPES} selected={form.activity_type_tags} onToggle={t => toggleTag('activity_type_tags', t, 5)} />
    </>
  )
}

function Step3({ form, toggleTag }: { form: any; toggleTag: (k: string, t: string, m?: number) => void }) {
  return (
    <>
      <Text className="section-title">性格标签 *（最多5个）</Text>
      <Tags list={PERSONALITY_TAGS} selected={form.personality_self_tags} onToggle={t => toggleTag('personality_self_tags', t, 5)} />
      <Text className="section-title">禁忌/边界（可选）</Text>
      <Tags list={TABOO_TAGS} selected={form.taboo_tags} onToggle={t => toggleTag('taboo_tags', t)} />
    </>
  )
}

function FInput({ label, value, placeholder, onInput }: { label: string; value: string; placeholder: string; onInput: (v: string) => void }) {
  return (
    <View className="form-row">
      <Text className="form-label">{label}</Text>
      <Input className="form-input" value={value} placeholder={placeholder} onInput={e => onInput(e.detail.value)} />
    </View>
  )
}

function FPicker({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (i: number) => void }) {
  return (
    <Picker mode="selector" range={options} value={options.indexOf(value)} onChange={e => onChange(e.detail.value as number)}>
      <View className="form-row">
        <Text className="form-label">{label}</Text>
        <Text className={`form-picker ${value ? '' : 'placeholder'}`}>{value || '请选择'}</Text>
      </View>
    </Picker>
  )
}

function Tags({ list, selected, onToggle }: { list: string[]; selected: string[]; onToggle: (t: string) => void }) {
  return (
    <View className="tag-grid">
      {list.map(t => (
        <View key={t} className={`tag ${selected.includes(t) ? 'active' : ''}`} onClick={() => onToggle(t)}>
          <Text className="tag-text">{t}</Text>
        </View>
      ))}
    </View>
  )
}
