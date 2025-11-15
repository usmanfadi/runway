import { readFileSync } from 'fs'
import { join } from 'path'
import PageRenderer from '@/components/PageRenderer'

export default function GoogleAdsManagement() {
  // Use existing PPC Advertising HTML file (page_0011.html) and replace content for Google Ads
  const htmlPath = join(process.cwd(), 'allure_out', 'pages', 'page_0011.html')
  let htmlContent = readFileSync(htmlPath, 'utf-8')
  
  // Replace PPC content with Google Ads specific content
  // Order matters: URLs first, then specific phrases, then general ones
  htmlContent = htmlContent
    // Replace URLs and links FIRST (before any text replacements)
    .replace(/https:\/\/alluredigital\.net\/ppc-advertising\//gi, 'https://alluredigital.net/google-ads-management/')
    .replace(/alluredigital\.net\/ppc-advertising/gi, 'alluredigital.net/google-ads-management')
    .replace(/\/ppc-advertising\//gi, '/google-ads-management/')
    .replace(/ppc-advertising/gi, 'google-ads-management')
    .replace(/href="https:\/\/alluredigital\.net\/ppc-advertising/gi, 'href="https://alluredigital.net/google-ads-management')
    .replace(/href="\/ppc-advertising/gi, 'href="/google-ads-management')
    .replace(/url=https%3A%2F%2Falluredigital\.net%2Fppc-advertising/gi, 'url=https%3A%2F%2Falluredigital.net%2Fgoogle-ads-management')
    // Replace specific long phrases
    .replace(/PPC specialists use high-end expertise to design, execute and build digital advertising campaigns/gi, 'Google Ads specialists use high-end expertise to design, execute and optimize Google advertising campaigns')
    .replace(/A Result Driven PPC Advertising Company/gi, 'Expert Google Ads Management Services')
    .replace(/Hire PPC managers to launch the result-driven PPC advertising campaigns/gi, 'Hire Google Ads managers to launch result-driven Google Ads campaigns')
    .replace(/Gain Instant Results With Powerful PPC Campaigns/gi, 'Gain Instant Results With Powerful Google Ads Campaigns')
    .replace(/Need maximum clicks on your paid advertisements at the best price\? Gain instant results with our powerful PPC paid search campaigns/gi, 'Need maximum clicks on your paid advertisements at the best price? Gain instant results with our powerful Google Ads campaigns')
    .replace(/If you don't invest your budget in PPC marketing/gi, "If you don't invest your budget in Google Ads marketing")
    .replace(/hire our professional PPC specialists/gi, 'hire our professional Google Ads specialists')
    // Replace compound phrases
    .replace(/PPC Advertising /gi, 'Google Ads Management ')
    .replace(/PPC Advertising/gi, 'Google Ads Management')
    .replace(/PPC paid search campaigns/gi, 'Google Ads campaigns')
    .replace(/PPC Campaigns/gi, 'Google Ads Campaigns')
    .replace(/PPC specialists/gi, 'Google Ads specialists')
    .replace(/PPC managers/gi, 'Google Ads managers')
    .replace(/PPC marketing/gi, 'Google Ads marketing')
    .replace(/Pay Per Click Advertising/gi, 'Google Ads Management')
    .replace(/pay per click advertising/gi, 'Google Ads Management')
    .replace(/pay-per-click/gi, 'Google Ads')
    .replace(/Pay Per Click/gi, 'Google Ads')
    .replace(/pay per click/gi, 'Google Ads')
    // Replace remaining standalone PPC (but be careful not to break URLs)
    .replace(/\bPPC\b/gi, 'Google Ads')
  
  return <PageRenderer html={htmlContent} />
}
