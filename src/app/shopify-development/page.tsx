import { readFileSync } from 'fs'
import { join } from 'path'
import PageRenderer from '@/components/PageRenderer'

export default function ShopifyDevelopment() {
  // Using bricks-builder-development HTML as template (similar development service structure)
  const htmlPath = join(process.cwd(), 'allure_out', 'pages', 'page_0015.html')
  const htmlContent = readFileSync(htmlPath, 'utf-8')
  return <PageRenderer html={htmlContent} />
}

