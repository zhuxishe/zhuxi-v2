import { getLegalMetadata, LegalPage } from "@/components/legal/LegalPage"

export const generateMetadata = () => getLegalMetadata("privacy")

export default function PrivacyPage() {
  return <LegalPage kind="privacy" />
}
