import { readFileSync } from 'fs'
import { join } from 'path'
import PageRenderer from '@/components/PageRenderer'

export default function Blog() {
  const htmlPath = join(process.cwd(), 'allure_out', 'pages', 'page_0020.html')
  const htmlContent = readFileSync(htmlPath, 'utf-8')
  return <PageRenderer html={htmlContent} />
}

