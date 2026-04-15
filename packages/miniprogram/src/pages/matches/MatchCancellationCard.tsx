import { View, Text, Textarea } from '@tarojs/components'
import { CANCEL_STATUS, MatchDetail } from './match-detail-types'

interface Props {
  match: MatchDetail
  showCancel: boolean
  cancelReason: string
  submitting: boolean
  onReasonChange: (value: string) => void
  onShowCancel: (value: boolean) => void
  onSubmit: () => void
}

export function MatchCancellationCard({ match, showCancel, cancelReason, submitting, onReasonChange, onShowCancel, onSubmit }: Props) {
  const canCancel = match.status !== 'cancelled' && !match.cancellation_status

  return (
    <>
      {match.cancellation_status && (
        <View className="card cancel-card">
          <Text className="cancel-title">取消申请</Text>
          <View className={`cancel-badge ${match.cancellation_status}`}>
            <Text className="cancel-badge-text">{CANCEL_STATUS[match.cancellation_status] || match.cancellation_status}</Text>
          </View>
          {match.cancellation_reason ? <Text className="cancel-reason">原因: {match.cancellation_reason}</Text> : null}
          {match.cancellation_requested_at ? <Text className="cancel-time">申请时间: {new Date(match.cancellation_requested_at).toLocaleDateString('zh-CN')}</Text> : null}
          {match.cancellation_status === 'pending' ? <Text className="cancel-hint">管理员正在审核你的取消申请，请耐心等待。</Text> : null}
          {match.cancellation_status === 'rejected' ? <Text className="cancel-hint rejected">取消申请未通过，请按原匹配继续参与。</Text> : null}
        </View>
      )}

      {canCancel && !showCancel ? (
        <View className="cancel-btn" onClick={() => onShowCancel(true)}>
          <Text className="cancel-btn-text">申请取消匹配</Text>
        </View>
      ) : null}

      {showCancel ? (
        <View className="card">
          <Text className="section-title">取消原因（可选）</Text>
          <Textarea className="reason-input" value={cancelReason} placeholder="说明取消原因..." maxlength={200} onInput={(e) => onReasonChange(e.detail.value)} />
          <View className="cancel-actions">
            <View className="action-btn secondary" onClick={() => onShowCancel(false)}><Text className="action-text sec-text">取消</Text></View>
            <View className="action-btn danger" onClick={!submitting ? onSubmit : undefined}><Text className="action-text danger-text">{submitting ? '提交中...' : '确认申请'}</Text></View>
          </View>
        </View>
      ) : null}
    </>
  )
}
