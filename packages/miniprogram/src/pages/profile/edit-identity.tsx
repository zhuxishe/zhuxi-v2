import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { getMemberId } from '../../lib/member'
import './edit-identity.scss'

const GENDER_OPTIONS = ['male', 'female', 'other']
const GENDER_LABELS = ['男', '女', '其他']
const AGE_OPTIONS = ['18以下', '18-20', '21-23', '24-26', '27-29', '30+']
const NATIONALITY_OPTIONS = ['中国大陆', '中国台湾', '中国香港', '中国澳门', '日本', '韩国', '其他亚洲', '其他']
const CITY_OPTIONS = ['东京都', '神奈川县', '千叶县', '埼玉县', '其他']
const DEGREE_OPTIONS = ['undergraduate', 'master', 'doctoral', 'exchange', 'language_school', 'other']
const DEGREE_LABELS = ['本科', '硕士', '博士', '交换生', '语言学校', '其他']
const COURSE_LANG_OPTIONS = ['日语', '英语', '中文', '混合']
const ENROLLMENT_YEARS = Array.from({ length: 11 }, (_, i) => String(2020 + i))

export default function EditIdentity() {
  const [form, setForm] = useState({
    full_name: '',
    nickname: '',
    gender: '',
    age_range: '',
    nationality: '',
    current_city: '',
    school_name: '',
    department: '',
    degree_level: '',
    course_language: '',
    enrollment_year: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useDidShow(() => { loadData() })

  const loadData = async () => {
    try {
      const memberId = await getMemberId()
      const rows = await supabaseQuery<any[]>('member_identity', {
        select: 'full_name,nickname,gender,age_range,nationality,current_city,school_name,department,degree_level,course_language,enrollment_year',
        member_id: `eq.${memberId}`,
      })
      if (rows?.length) {
        const d = rows[0]
        setForm({
          full_name: d.full_name || '',
          nickname: d.nickname || '',
          gender: d.gender || '',
          age_range: d.age_range || '',
          nationality: d.nationality || '',
          current_city: d.current_city || '',
          school_name: d.school_name || '',
          department: d.department || '',
          degree_level: d.degree_level || '',
          course_language: d.course_language || '',
          enrollment_year: d.enrollment_year ? String(d.enrollment_year) : '',
        })
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const update = (key: string, val: string) => {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      Taro.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }

    setSaving(true)
    try {
      const memberId = await getMemberId()

      if (!form.gender || !form.age_range || !form.nationality || !form.current_city) {
        Taro.showToast({ title: '请填写所有必填项', icon: 'none' })
        setSaving(false)
        return
      }

      await supabaseQuery('member_identity', {
        on_conflict: 'member_id',
      }, {
        method: 'POST',
        body: {
          member_id: memberId,
          full_name: form.full_name.trim(),
          nickname: form.nickname.trim() || null,
          gender: form.gender,
          age_range: form.age_range,
          nationality: form.nationality,
          current_city: form.current_city,
          school_name: form.school_name.trim() || null,
          department: form.department.trim() || null,
          degree_level: form.degree_level || null,
          course_language: form.course_language || null,
          enrollment_year: form.enrollment_year ? Number(form.enrollment_year) : null,
        },
      })

      Taro.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (err: any) {
      console.error('保存失败:', err)
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
        <FormInput label="姓名" value={form.full_name} placeholder="真实姓名"
          onInput={v => update('full_name', v)} />
        <FormInput label="昵称" value={form.nickname} placeholder="可选"
          onInput={v => update('nickname', v)} />

        <Picker mode="selector" range={GENDER_LABELS}
          value={GENDER_OPTIONS.indexOf(form.gender)}
          onChange={e => update('gender', GENDER_OPTIONS[e.detail.value as number])}>
          <View className="form-row">
            <Text className="form-label">性别</Text>
            <Text className={`form-picker ${form.gender ? '' : 'placeholder'}`}>
              {form.gender ? GENDER_LABELS[GENDER_OPTIONS.indexOf(form.gender)] : '请选择'}
            </Text>
          </View>
        </Picker>

        <Picker mode="selector" range={AGE_OPTIONS}
          value={AGE_OPTIONS.indexOf(form.age_range)}
          onChange={e => update('age_range', AGE_OPTIONS[e.detail.value as number])}>
          <View className="form-row">
            <Text className="form-label">年龄段</Text>
            <Text className={`form-picker ${form.age_range ? '' : 'placeholder'}`}>
              {form.age_range || '请选择'}
            </Text>
          </View>
        </Picker>

        <Picker mode="selector" range={NATIONALITY_OPTIONS}
          value={NATIONALITY_OPTIONS.indexOf(form.nationality)}
          onChange={e => update('nationality', NATIONALITY_OPTIONS[e.detail.value as number])}>
          <View className="form-row">
            <Text className="form-label">国籍</Text>
            <Text className={`form-picker ${form.nationality ? '' : 'placeholder'}`}>
              {form.nationality || '请选择'}
            </Text>
          </View>
        </Picker>

        <Picker mode="selector" range={CITY_OPTIONS}
          value={CITY_OPTIONS.indexOf(form.current_city)}
          onChange={e => update('current_city', CITY_OPTIONS[e.detail.value as number])}>
          <View className="form-row">
            <Text className="form-label">所在城市</Text>
            <Text className={`form-picker ${form.current_city ? '' : 'placeholder'}`}>
              {form.current_city || '请选择'}
            </Text>
          </View>
        </Picker>

        <FormInput label="学校" value={form.school_name} placeholder="学校名称"
          onInput={v => update('school_name', v)} />
        <FormInput label="专业" value={form.department} placeholder="专业/部门"
          onInput={v => update('department', v)} />

        <Picker mode="selector" range={DEGREE_LABELS}
          value={DEGREE_OPTIONS.indexOf(form.degree_level)}
          onChange={e => update('degree_level', DEGREE_OPTIONS[e.detail.value as number])}>
          <View className="form-row">
            <Text className="form-label">学历</Text>
            <Text className={`form-picker ${form.degree_level ? '' : 'placeholder'}`}>
              {form.degree_level ? DEGREE_LABELS[DEGREE_OPTIONS.indexOf(form.degree_level)] : '请选择'}
            </Text>
          </View>
        </Picker>

        <Picker mode="selector" range={COURSE_LANG_OPTIONS}
          value={COURSE_LANG_OPTIONS.indexOf(form.course_language)}
          onChange={e => update('course_language', COURSE_LANG_OPTIONS[e.detail.value as number])}>
          <View className="form-row">
            <Text className="form-label">授课语言</Text>
            <Text className={`form-picker ${form.course_language ? '' : 'placeholder'}`}>
              {form.course_language || '请选择'}
            </Text>
          </View>
        </Picker>

        <Picker mode="selector" range={ENROLLMENT_YEARS}
          value={ENROLLMENT_YEARS.indexOf(form.enrollment_year)}
          onChange={e => update('enrollment_year', ENROLLMENT_YEARS[e.detail.value as number])}>
          <View className="form-row">
            <Text className="form-label">入学年份</Text>
            <Text className={`form-picker ${form.enrollment_year ? '' : 'placeholder'}`}>
              {form.enrollment_year || '请选择'}
            </Text>
          </View>
        </Picker>
      </View>

      <View className="save-btn" onClick={!saving ? handleSave : undefined}>
        <Text className="save-text">{saving ? '保存中...' : '保存'}</Text>
      </View>
    </View>
  )
}

function FormInput({ label, value, placeholder, onInput }: {
  label: string; value: string; placeholder: string; onInput: (v: string) => void
}) {
  return (
    <View className="form-row">
      <Text className="form-label">{label}</Text>
      <Input className="form-input" value={value} placeholder={placeholder}
        onInput={e => onInput(e.detail.value)} />
    </View>
  )
}
