import { readFileSync } from 'fs'
import { join } from 'path'
import PageRenderer from '@/components/PageRenderer'

export default function SocialMediaManagement() {
  // Use page_0002.html for social media management
  const htmlPath = join(process.cwd(), 'allure_out', 'pages', 'page_0002.html')
  const htmlContent = readFileSync(htmlPath, 'utf-8')
  
  return <PageRenderer html={htmlContent} />
}

