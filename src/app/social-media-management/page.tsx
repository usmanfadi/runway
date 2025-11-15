import { readFileSync } from 'fs'
import { join } from 'path'
import PageRenderer from '@/components/PageRenderer'

export default function SocialMediaManagement() {
  // Use existing Social Media Management HTML file (page_0016.html) - PageRenderer will handle branding replacement
  const htmlPath = join(process.cwd(), 'allure_out', 'pages', 'page_0016.html')
  const htmlContent = readFileSync(htmlPath, 'utf-8')
  return <PageRenderer html={htmlContent} />
}
