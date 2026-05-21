export type TeamMember = {
  name: string
  role: string
  school: string
  major: string
}

export type TeamDepartment = {
  slug: string
  name: string
  intro: string
  members: TeamMember[]
}

export const teamLeads: TeamMember[] = [
  { name: "Joanna", role: "社长", school: "东京理科大学", major: "工学部" },
  { name: "Kane", role: "发起人", school: "早稻田大学", major: "机械科学" },
]

export const teamDepartments: TeamDepartment[] = [
  {
    slug: "events",
    name: "活动部",
    intro: "策划线下活动，照顾现场节奏",
    members: [
      { name: "BIGJO", role: "活动部部长", school: "东京大学", major: "新领域" },
      { name: "Alice", role: "活动部社员", school: "上智大学", major: "经济学科" },
      { name: "Eliza", role: "活动部社员", school: "早稻田大学", major: "国际教养" },
      { name: "Aimon", role: "活动部成员", school: "青岛农业大学", major: "数字媒体艺术" },
      { name: ". . .", role: "活动部社员・本科在读", school: "东京理科大学", major: "机械" },
    ],
  },
  {
    slug: "planning",
    name: "策划剧本部",
    intro: "设计社交剧本，打磨互动流程",
    members: [
      { name: "Quinn", role: "策划剧本部成员", school: "早稻田大学", major: "社会科学部" },
      { name: "Olivia", role: "企划部员", school: "早稻田大学", major: "政治经济学部" },
    ],
  },
  {
    slug: "media",
    name: "宣传部",
    intro: "记录活动日常，整理对外内容",
    members: [
      { name: "Aster", role: "宣传部部长", school: "早稻田大学", major: "电子物理系" },
      { name: "kiki", role: "宣传部", school: "早稻田大学", major: "教育学部" },
      { name: "Linda", role: "宣传部部员", school: "中央大学", major: "经营工" },
      { name: "Shaw", role: "宣传部社员", school: "中央大学", major: "法学部法律学科" },
      { name: "tang tang", role: "宣传部社员", school: "顺天堂大学", major: "健康数据科学科" },
    ],
  },
  {
    slug: "algorithm",
    name: "算法部",
    intro: "平台及算法开发，提供技术支持",
    members: [
      { name: "Sean", role: "算法部", school: "早稻田大学", major: "运动医学专业" },
      { name: "Paopao", role: "算法部", school: "早稻田大学", major: "机械科学" },
    ],
  },
]

export function findDepartment(slug: string) {
  return teamDepartments.find((department) => department.slug === slug)
}
