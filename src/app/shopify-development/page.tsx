import { readFileSync } from 'fs'
import { join } from 'path'
import PageRenderer from '@/components/PageRenderer'

export default function ShopifyDevelopment() {
  // Using bricks-builder-development HTML as template and replace content for Shopify
  const htmlPath = join(process.cwd(), 'allure_out', 'pages', 'page_0015.html')
  let htmlContent = readFileSync(htmlPath, 'utf-8')
  
  // Replace Bricks Builder content with Shopify specific content
  htmlContent = htmlContent
    .replace(/Bricks Builder Development/gi, 'Shopify Development')
    .replace(/Bricks Builder/gi, 'Shopify')
    .replace(/Bricks Builder Development Services - Fast, Custom Websites/gi, 'Shopify Development Services - Custom E-commerce Solutions')
    .replace(/Bricks Builder Development for websites that look great, perform better, and scale with your business/gi, 'Shopify Development for e-commerce stores that look great, perform better, and scale with your business')
    .replace(/Built with Bricks Builder: clean, fast, and future-ready/gi, 'Built with Shopify: clean, fast, and future-ready')
    .replace(/Build My WordPress Site with Bricks/gi, 'Build My Shopify Store')
    .replace(/We are an innovative Brooklyn WordPress Web Development Company specializing in design, development, support &amp; maintenance of WordPress websites/gi, 'We are an innovative e-commerce development company specializing in design, development, support & maintenance of Shopify stores')
    .replace(/Bricks Builder Development \| Web Development Agency/gi, 'Shopify Development | E-commerce Development Agency')
  
  return <PageRenderer html={htmlContent} />
}

