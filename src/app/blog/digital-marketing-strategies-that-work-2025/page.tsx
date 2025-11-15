import { readFileSync } from 'fs'
import { join } from 'path'
import PageRenderer from '@/components/PageRenderer'

export default function BlogPost() {
  try {
    const htmlPath = join(process.cwd(), 'allure_out', 'pages', 'page_0028.html')
    const htmlContent = readFileSync(htmlPath, 'utf-8')
    return <PageRenderer html={htmlContent} />
  } catch (error) {
    console.error('Error loading blog post:', error)
    return <div>Error loading page. Please check console.</div>
  }
}

