import { readFileSync } from 'fs'
import { join } from 'path'
import PageRenderer from '@/components/PageRenderer'

export default function WorkCase() {
  const htmlPath = join(process.cwd(), 'allure_out', 'pages', 'page_0046.html')
  const htmlContent = readFileSync(htmlPath, 'utf-8')
  return <PageRenderer html={htmlContent} />
}

