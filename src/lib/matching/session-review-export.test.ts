import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SavedMatchingReview } from "./session-review-types"
import { createSessionExportWorkbook } from "./session-export-workbook"
import { buildSavedMatchingReview, savedMatchingReviewWorkbookData } from "./session-review"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), from: vi.fn(), review: vi.fn(), oldSnapshot: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock("./input-snapshot-reader", async (original) => ({ ...await original<typeof import("./input-snapshot-reader")>(), fetchMatchingInputSnapshot: mocks.oldSnapshot }))
vi.mock("./session-review-service", () => ({ readSavedMatchingReview: mocks.review, MatchingReviewStaleError: class extends Error { constructor() { super("方案或报名资料已变化，请重新核对后导出") } } }))
import { buildSessionExportWorkbook } from "./session-export"
import { MatchingReviewStaleError } from "./session-review-service"

const revision = "a".repeat(32), signature = "b".repeat(64)
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const member = (n: number) => ({ id: id(n), name: `玩家${n}`, memberNumber: `ZXS_${String(n).padStart(3, "0")}` })
const recommendation = "2026-11-05_下午"
function fixture() {
  const groups: SavedMatchingReview["groups"] = [
    { resultId: id(100), label: "双人 01", kind: "duo", members: [member(1), member(2)], recommendedSlot: recommendation, commonSlots: [recommendation, "2026-11-06_晚上"], timeStatus: "ready" },
    { resultId: id(101), label: "多人 01", kind: "multi", groupKind: "small", members: [3,4,5,6,7].map(member), recommendedSlot: recommendation, commonSlots: [recommendation, "2026-11-07_上午"], timeStatus: "ready" },
    { resultId: id(102), label: "多人 02", kind: "multi", groupKind: "small", members: [8,9,10,11,12].map(member), recommendedSlot: recommendation, commonSlots: [recommendation], timeStatus: "ready" },
  ]
  const review: SavedMatchingReview = { sessionId: id(500), revisionToken: revision, publicationSignature: signature, capturedAt: "2026-11-02T05:00:00Z", sessionStatus: "draft", publicationVersion: 0, canViewTimes: true, groups, waitingDuo: [member(13)], waitingMulti: [member(14)], unmatched: [member(15)], summary: { total: 15, matched: 12, duoGroups: 1, multiGroups: 2, waitingDuo: 1, waitingMulti: 1, unmatched: 1 }, issues: [] }
  const workbookData = { results: groups.map((g, index) => ({ id: g.resultId, member_a_id: g.members[0].id, member_b_id: g.kind === "duo" ? g.members[1].id : null, group_members: g.kind === "multi" ? g.members.map(m=>m.id) : null, best_slot: g.recommendedSlot, rank: index + 1, status: "draft", total_score: 70 + index })),
    members: Array.from({length:15},(_,i)=>({id:id(i+1),member_number:`ZXS_${i+1}`,member_identity:{full_name:`无关旧名${i+1}`}})),
    submissions: Array.from({length:15},(_,i)=>({member_id:id(i+1),availability:{"2026-11-05":["下午"],"2026-11-06":["晚上"]},gender_pref:"都可以",game_type_pref:i<2?"双人":"多人",message:`当前留言${i+1}`})),cohortMemberIds:Array.from({length:15},(_,i)=>id(i+1)),layout:null,capturedAt:review.capturedAt }
  return { review, workbookData }
}
let data: ReturnType<typeof fixture>
let purpose: string | null
function rows(book: ExcelJS.Workbook, name: string) {
  const sheet = book.getWorksheet(name)!, headers = (sheet.getRow(1).values as string[]).slice(1)
  return Array.from({length:sheet.rowCount-1},(_,i)=>Object.fromEntries(headers.map((header,index)=>[header,sheet.getRow(i+2).getCell(index+1).value])))
}
async function exported(options: Parameters<typeof buildSessionExportWorkbook>[1] = { expectedRevision: revision, expectedPublicationSignature: signature }) {
  const result = await buildSessionExportWorkbook(id(500), options), book = new ExcelJS.Workbook()
  await book.xlsx.load(result.buffer as never)
  return book
}
beforeEach(()=>{
  vi.resetAllMocks(); data=fixture(); purpose="matching"
  mocks.admin.mockResolvedValue({id:id(900),role:"super_admin"})
  mocks.review.mockImplementation(async (_id, expected)=>{if(expected!==undefined&&expected!==data.review.revisionToken)throw new MatchingReviewStaleError();return data})
  mocks.from.mockImplementation((table)=>{
    if(table!=="match_sessions")throw new Error(`Unexpected separate data read: ${table}`)
    const query={select:vi.fn(()=>query),eq:vi.fn(()=>query),single:vi.fn(async()=>({data:{id:id(500),session_name:"核对测试",round_id:id(600),round:{round_name:"本轮",purpose}},error:null}))}
    return query
  })
})

describe("review-aligned matching export",()=>{
  it("projects one real capture into both the review and workbook without alternate time or member reads", async()=>{
    const people = [...data.review.groups.flatMap(group=>group.members),...data.review.waitingDuo,...data.review.waitingMulti,...data.review.unmatched]
    const capture = { base_revision: revision, session_status: "draft", cohort_member_ids: data.workbookData.cohortMemberIds,
      results: data.workbookData.results.map(row=>({...row,score_breakdown:null,game_type:row.group_members?"多人":"双人"})),
      layout: { multiMode: "grouped" as const, waitingDuoIds: [id(13)], brokenPairs: [], waitingMultiIds: [id(14)], multiPoolSlot: recommendation, smallGroupMemberIds: data.review.groups.filter(group=>group.kind==="multi").map(group=>group.members.map(m=>m.id)) },
      capture: { captured_at: data.review.capturedAt, source: { submissions: data.workbookData.submissions.map(row=>({ ...row,
        member: { id:row.member_id,member_number:people.find(member=>member.id===row.member_id)!.memberNumber,member_identity:{full_name:people.find(member=>member.id===row.member_id)!.name} }
      })) } } }
    const review=buildSavedMatchingReview(id(500),capture,true)
    const raw=createSessionExportWorkbook({...savedMatchingReviewWorkbookData(capture,review),diagnostics:[],snapshot:null,review})
    const book=new ExcelJS.Workbook();await book.xlsx.load(await raw.xlsx.writeBuffer() as never)
    const exported=rows(book,"结果发布")
    expect(exported.map(row=>String(row.玩家姓名).split("\n"))).toEqual(review.groups.map(group=>group.members.map(member=>member.name)))
    expect(exported.map(row=>row.组别)).toEqual(review.groups.map(group=>group.label))
    expect(exported.every(row=>row.核对版本===review.revisionToken)).toBe(true)
    expect(rows(book,"多人本配对结果").map(row=>row.人数)).toEqual([5,5])
    for(let index=0;index<review.groups.length;index++)for(const slot of review.groups[index].commonSlots){
      const [date,period]=slot.split("_")
      expect(exported[index].共同可用时间段).toContain(date)
      expect(exported[index].共同可用时间段).toContain(period)
    }
  })
  it("exports the two saved five-person groups separately with the same labels, members and times as the review",async()=>{
    const book=await exported()
    expect(book.worksheets.map(sheet=>sheet.name)).toEqual(["双人本配对结果","多人本配对结果","未匹配名单","结果发布"])
    const multi=rows(book,"多人本配对结果")
    expect(multi).toHaveLength(2)
    expect(multi.map(row=>row.人数)).toEqual([5,5])
    expect(multi.map(row=>row.组别)).toEqual(data.review.groups.slice(1).map(group=>group.label))
    expect(multi.map(row=>String(row.组内玩家所有姓名).split("\n"))).toEqual(data.review.groups.slice(1).map(group=>group.members.map(m=>m.name)))
    expect(multi[0].其他共同时间).toContain("2026-11-07")
    expect(multi[0].其他共同时间).not.toContain("2026-11-05")
    expect(multi[1].其他共同时间).toBe("无其他共同时间")
    expect(rows(book,"结果发布").map(row=>row.组别)).toEqual(data.review.groups.map(group=>group.label))
    expect(multi[0]).toMatchObject({input_source:"当前已保存方案／本次核对报名资料",captured_at:data.review.capturedAt,核对版本:revision,方案状态:"已保存草稿（未发布）",分组方式:"4–6人组"})
    expect(mocks.oldSnapshot).not.toHaveBeenCalled()
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
  it("uses reviewed current intersections rather than reconstructing the initial batch snapshot",async()=>{
    const book=await exported(), row=rows(book,"双人本配对结果")[0]
    expect(row.双人所有可用时间段).toContain("2026-11-06")
    expect(row.备注).toContain("当前留言1")
    expect(row.玩家姓名1).toBe("玩家1")
    expect(mocks.review).toHaveBeenCalledExactlyOnceWith(id(500),revision)
    expect(mocks.oldSnapshot).not.toHaveBeenCalled()
  })
  it("keeps waiting-for-duo, waiting-for-multi and unmatched statuses distinct",async()=>{
    const unmatched=rows(await exported(),"未匹配名单")
    expect(unmatched.map(row=>row.安排状态)).toEqual(["待双人搭档","待多人分组","未匹配"])
    expect(unmatched.map(row=>row.玩家姓名)).toEqual(["玩家13","玩家14","玩家15"])
    expect(unmatched.every(row=>row.核对版本===revision)).toBe(true)
  })
  it("rejects stale revisions and changed publication signatures before creating a workbook",async()=>{
    await expect(exported({expectedRevision:"old"})).rejects.toBeInstanceOf(MatchingReviewStaleError)
    await expect(exported({expectedRevision:revision,expectedPublicationSignature:"old"})).rejects.toBeInstanceOf(MatchingReviewStaleError)
    expect(mocks.oldSnapshot).not.toHaveBeenCalled()
  })
  it("also uses the current read model on old direct export URLs with no review token",async()=>{
    await exported({})
    expect(mocks.review).toHaveBeenCalledExactlyOnceWith(id(500),undefined)
    expect(mocks.oldSnapshot).not.toHaveBeenCalled()
  })
  it("treats historical null-purpose matching rounds as the same review flow",async()=>{
    purpose=null;await exported()
    expect(mocks.review).toHaveBeenCalledOnce()
  })
  it("fails closed on unavailable review data without reverting to an initial snapshot",async()=>{
    mocks.review.mockRejectedValue(new Error("无法读取当前分组"))
    await expect(exported()).rejects.toThrow("无法读取当前分组")
    expect(mocks.oldSnapshot).not.toHaveBeenCalled()
  })
  it("keeps exports restricted to super admins",async()=>{
    mocks.admin.mockResolvedValue({id:id(900),role:"admin"})
    await expect(exported()).rejects.toThrow("仅超级管理员")
    expect(mocks.from).not.toHaveBeenCalled();expect(mocks.review).not.toHaveBeenCalled()
  })
  it("distinguishes unavailable time from no other common time and records published state",async()=>{
    data.review.groups[0].timeStatus="unavailable";data.review.groups[0].commonSlots=[]
    data.review.sessionStatus="confirmed";data.review.publicationVersion=2
    const book=await exported(),row=rows(book,"双人本配对结果")[0]
    expect(row.双人所有可用时间段).toBe("资料不足，无法计算")
    expect(row.其他共同时间).toBe("资料不足，无法计算")
    expect(row.方案状态).toBe("已发布")
  })
  it("writes names and notes as literal cells and excludes internal IDs from sheets",async()=>{
    data.review.groups[0].members[0].name='=HYPERLINK("https://example.invalid","name")'
    data.workbookData.submissions[0].message='=WEBSERVICE("https://example.invalid")'
    const book=await exported()
    for(const sheet of book.worksheets)sheet.eachRow(row=>row.eachCell(cell=>{
      expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)
      expect(String(cell.value)).not.toMatch(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/i)
    }))
  })
  it("rejects mismatched group membership, duplicate waiting people, and missing raw rows",()=>{
    const build=()=>createSessionExportWorkbook({...data.workbookData,diagnostics:[],snapshot:null,review:data.review})
    data.review.groups[1].members[0]=member(99)
    expect(build).toThrow("不一致")
    data=fixture();data.review.waitingMulti=[member(1)]
    expect(build).toThrow("重复")
    data=fixture();data.workbookData.results.pop()
    expect(build).toThrow("不一致")
  })
})
