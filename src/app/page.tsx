import { readFileSync } from 'fs'
import { join } from 'path'
import PageRenderer from '@/components/PageRenderer'

export default function Home() {
  // Manually read homepage HTML (page_0004.html is the main homepage)
  const htmlPath = join(process.cwd(), 'allure_out', 'pages', 'page_0004.html')
  const htmlContent = readFileSync(htmlPath, 'utf-8')
  
  return <PageRenderer html={htmlContent} />
}

