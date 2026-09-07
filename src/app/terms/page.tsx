import { getLegalMetadata, LegalPage } from "@/components/legal/LegalPage"

export const generateMetadata = () => getLegalMetadata("terms")

export default function TermsPage() {
  return <LegalPage kind="terms" />
}
