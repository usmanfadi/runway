import { readFileSync } from 'fs'
import { join } from 'path'
import PageRenderer from '@/components/PageRenderer'

export default function WordPressDevelopment() {
  const htmlPath = join(process.cwd(), 'allure_out', 'pages', 'page_0013.html')
  const htmlContent = readFileSync(htmlPath, 'utf-8')
  return <PageRenderer html={htmlContent} />
}

