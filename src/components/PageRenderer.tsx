'use client'

import { useEffect, useRef, useState } from 'react'

interface PageRendererProps {
  html: string
}

// Helper to extract filename from URL (handles query params)
// IMPORTANT: Asset files are named with alluredigital.net, so always convert rimalweb.net first
function getAssetFilename(url: string): string | null {
  try {
    // ALWAYS convert rimalweb.net to alluredigital.net FIRST - asset files use alluredigital.net
    let urlToProcess = url
    if (url && (url.includes('rimalweb.net') || url.includes('Rimalweb.net') || url.includes('RimalWeb.net') || url.includes('RIMALWEB.NET'))) {
      urlToProcess = url.replace(/rimalweb\.net/gi, 'alluredigital.net')
    }
    
    const urlObj = new URL(urlToProcess, 'https://alluredigital.net')
    const pathParts = urlObj.pathname.split('/').filter(p => p)
    if (pathParts.length === 0) return null
    
    // For litespeed CSS/JS files, construct full path (matches scraped filename format)
    if (urlObj.pathname.includes('/litespeed/')) {
      // Format: domain_path_to_file.css
      const domain = urlObj.hostname.replace('www.', '')
      const fullPath = domain + urlObj.pathname
      // Replace slashes with underscores, keep dots and dashes
      let filename = fullPath.replace(/\//g, '_')
      // Remove query params from filename (already handled by scraper)
      filename = filename.split('?')[0]
      return filename || null
    }
    
    // For wp-content/uploads files
    if (urlObj.pathname.includes('/wp-content/uploads/')) {
      const domain = urlObj.hostname.replace('www.', '')
      const fullPath = domain + urlObj.pathname
      let filename = fullPath.replace(/\//g, '_')
      filename = filename.split('?')[0]
      return filename || null
    }
    
    // For other files, construct domain_path format
    const domain = urlObj.hostname.replace('www.', '')
    const fullPath = domain + urlObj.pathname
    let filename = fullPath.replace(/\//g, '_')
    filename = filename.split('?')[0]
    
    return filename || null
  } catch {
    return null
  }
}

export default function PageRenderer({ html }: PageRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scriptsLoadedRef = useRef<Set<string>>(new Set())
  const stylesLoadedRef = useRef<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const cleanupRef = useRef<(() => void) | null>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!containerRef.current || !html) return
    
    setIsLoading(true)

    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Extract and inject head content FIRST (before body)
    const head = doc.querySelector('head')
    const stylePromises: Promise<void>[] = []
    
    if (head) {
        // Load Google Fonts (Montserrat and Poppins) - same as original website
        const googleFontsLink = document.createElement('link')
        googleFontsLink.rel = 'preconnect'
        googleFontsLink.href = 'https://fonts.googleapis.com'
        document.head.appendChild(googleFontsLink)
        
        const googleFontsLink2 = document.createElement('link')
        googleFontsLink2.rel = 'preconnect'
        googleFontsLink2.href = 'https://fonts.gstatic.com'
        googleFontsLink2.crossOrigin = 'anonymous'
        document.head.appendChild(googleFontsLink2)
        
        const fontLink = document.createElement('link')
        fontLink.rel = 'stylesheet'
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap'
        document.head.appendChild(fontLink)
        
      // Preload ALL assets first so browser caches them (won't reload on refresh)
      const allAssets: Array<{ href: string; as: string }> = []
      
      // Collect all CSS files
      head.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
        const href = el.getAttribute('href') || ''
        if (href.includes('alluredigital.net') && !href.includes('fonts.googleapis.com')) {
          const filename = getAssetFilename(href)
          if (filename) {
            allAssets.push({ href: `/assets/${filename}`, as: 'style' })
          }
        }
      })
      
      // Collect all script files
      head.querySelectorAll('script[src]').forEach((el) => {
        const src = el.getAttribute('src') || ''
        if (src && (src.includes('alluredigital.net') || src.startsWith('/assets/'))) {
          const filename = getAssetFilename(src)
          if (filename) {
            allAssets.push({ href: `/assets/${filename}`, as: 'script' })
          }
        }
      })
      
      // Collect critical images from body
      const body = doc.querySelector('body')
      if (body) {
        // Logo (use small 1.png for navbar)
        allAssets.push({ href: '/1.png', as: 'image' })
        
        // Hero and important images (first 15)
        let imageCount = 0
        body.querySelectorAll('img[src]').forEach((el) => {
          if (imageCount >= 15) return
          const src = (el as HTMLImageElement).getAttribute('src') || ''
          if (src && (src.includes('alluredigital.net') || src.includes('rimalweb.net') || src.startsWith('/assets/'))) {
            const fixedSrc = src.includes('/assets/') ? src : `/assets/${getAssetFilename(src) || ''}`
            if (fixedSrc && fixedSrc !== '/assets/' && !allAssets.some(a => a.href === fixedSrc)) {
              allAssets.push({ href: fixedSrc, as: 'image' })
              imageCount++
            }
          }
        })
      }
      
      // Add preload links for ALL assets (browser will cache them)
      allAssets.forEach((asset) => {
        if (asset.href && !document.querySelector(`link[rel="preload"][href="${asset.href}"]`)) {
          const preloadLink = document.createElement('link')
          preloadLink.rel = 'preload'
          preloadLink.as = asset.as
          preloadLink.href = asset.href
          // Add crossorigin for fonts if needed
          if (asset.as === 'font') {
            preloadLink.crossOrigin = 'anonymous'
          }
          document.head.appendChild(preloadLink)
        }
      })
      
      // Inject ALL stylesheets (preserve order for animations)
      head.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => {
        if (el.tagName === 'LINK') {
          const href = el.getAttribute('href') || ''
          const styleId = href
          
          if (!stylesLoadedRef.current.has(styleId)) {
            const clone = el.cloneNode(true) as HTMLLinkElement
            
            // Only load local CSS - skip external fonts
            if (href.includes('fonts.googleapis.com') || 
                href.includes('googleapis.com') ||
                href.includes('gstatic.com')) {
              // Skip external fonts - don't load them
              return
            } else if (href.includes('alluredigital.net') || href.startsWith('http')) {
              const filename = getAssetFilename(href)
              if (filename) {
                clone.href = `/assets/${filename}`
              } else {
                // Skip if can't find local asset
                return
              }
            }
            
            clone.setAttribute('data-injected', 'true')
            
            // Wait for stylesheet to load and be applied
            const stylePromise = new Promise<void>((resolve) => {
              let resolved = false
              const resolveOnce = () => {
                if (!resolved) {
                  resolved = true
                  // Wait a bit more to ensure CSS is applied to DOM
                  setTimeout(() => resolve(), 100)
                }
              }
              
              clone.onload = resolveOnce
              clone.onerror = resolveOnce // Continue even if stylesheet fails
              document.head.appendChild(clone)
              
              // Fallback: resolve after reasonable timeout
              setTimeout(() => {
                if (!resolved) {
                  resolveOnce()
                }
              }, 2000)
            })
            stylePromises.push(stylePromise)
            stylesLoadedRef.current.add(styleId)
          }
        } else if (el.tagName === 'STYLE') {
          // Inline styles - inject directly
          const styleId = el.textContent?.substring(0, 50) || Math.random().toString()
          if (!stylesLoadedRef.current.has(styleId)) {
            const clone = el.cloneNode(true) as HTMLStyleElement
            clone.setAttribute('data-injected', 'true')
            document.head.appendChild(clone)
            stylesLoadedRef.current.add(styleId)
          }
        }
      })

      // Inject meta tags and title (with branding replacement)
      head.querySelectorAll('meta, title').forEach((el) => {
        if (el.tagName === 'TITLE') {
          // Always update title, whether it exists or not
          const titleText = el.textContent || ''
          const replacedText = titleText
            .replace(/Allure Digital/gi, 'Rimalweb')
            .replace(/AllureDigital/gi, 'Rimalweb')
            .replace(/allure digital/gi, 'Rimalweb')
            .replace(/AllureDigital\.net/gi, 'Rimalweb')
            .replace(/alluredigital\.net/gi, 'Rimalweb')
          
          // Update document.title directly (this is what shows in browser tab)
          document.title = replacedText || 'Rimalweb'
          
          // Also update/create title tag in head
          let existingTitle = document.querySelector('title')
          if (existingTitle) {
            existingTitle.textContent = replacedText || 'Rimalweb'
          } else {
            const newTitle = document.createElement('title')
            newTitle.textContent = replacedText || 'Rimalweb'
            document.head.appendChild(newTitle)
          }
          
          // Force update after a small delay to ensure it persists
          setTimeout(() => {
            document.title = replacedText || 'Rimalweb'
            const titleEl = document.querySelector('title')
            if (titleEl) {
              titleEl.textContent = replacedText || 'Rimalweb'
            }
          }, 100)
        } else if (el.tagName === 'META') {
          // Handle meta tags
        const existing = document.querySelector(
            `meta[name="${el.getAttribute('name') || el.getAttribute('property')}"]`
        )
        if (!existing) {
          const clone = el.cloneNode(true) as HTMLElement
            const content = clone.getAttribute('content')
            if (content) {
              clone.setAttribute('content', content
                .replace(/Allure Digital/gi, 'Rimalweb')
                .replace(/AllureDigital/gi, 'Rimalweb')
                .replace(/allure digital/gi, 'Rimalweb')
                .replace(/alluredigital\.net/gi, 'rimalweb.com'))
            }
          document.head.appendChild(clone)
          } else {
            // Update existing meta tag
            const content = el.getAttribute('content')
            if (content) {
              const replacedContent = content
                .replace(/Allure Digital/gi, 'Rimalweb')
                .replace(/AllureDigital/gi, 'Rimalweb')
                .replace(/allure digital/gi, 'Rimalweb')
                .replace(/alluredigital\.net/gi, 'rimalweb.com')
              existing.setAttribute('content', replacedContent)
            }
          }
        }
      })
    }

    // Extract body and preserve ALL attributes and classes
    const body = doc.querySelector('body')
    if (body && containerRef.current) {
      // Apply body classes to container to preserve styling
      const bodyClasses = body.className
      if (bodyClasses) {
        containerRef.current.className = bodyClasses
      }
      
      // Copy body attributes
      Array.from(body.attributes).forEach((attr) => {
        if (attr.name !== 'class') {
          containerRef.current?.setAttribute(attr.name, attr.value)
        }
      })

      // Check if asset file exists (async check)
      const checkAssetExists = async (path: string): Promise<boolean> => {
        try {
          const response = await fetch(path, { method: 'HEAD' })
          return response.ok
        } catch {
          return false
        }
      }

      // Fix ALL asset URLs in body BEFORE setting innerHTML
      // IMPORTANT: Asset files are named with alluredigital.net, so always convert rimalweb.net first
      const fixAssetUrl = (url: string): string => {
        if (!url || url.startsWith('data:') || url.startsWith('/assets/')) return url
        
        // ALWAYS convert rimalweb.net (any case variation) to alluredigital.net FIRST for asset filename lookup
        let urlToProcess = url
        if (/rimalweb\.net/i.test(url)) {
          urlToProcess = url.replace(/rimalweb\.net/gi, 'alluredigital.net')
        }
        
        // Now process with alluredigital.net URL
        if (urlToProcess.includes('alluredigital.net') || urlToProcess.startsWith('http')) {
          const filename = getAssetFilename(urlToProcess)
          if (filename) {
            // WordPress adds size suffixes like -2048x903, -300x200, etc. to image URLs
            // but the actual files don't have these suffixes. Strip them from filename.
            const filenameWithoutSize = filename.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1')
            return `/assets/${filenameWithoutSize}`
          }
        }
        
        return url
      }

      // Fix images and replace logo images with custom SVG logo
      body.querySelectorAll('img[src]').forEach((img) => {
        const src = img.getAttribute('src')
        if (src) {
          const fixedSrc = fixAssetUrl(src)
          img.setAttribute('src', fixedSrc)
          
          // Check if image is in "Welcome to Rimalweb" section
          const welcomeSection = img.closest('section, div')?.querySelector('h2, h1, .elementor-heading-title')
          const isWelcomeSection = welcomeSection && (
            welcomeSection.textContent?.includes('Welcome to') ||
            welcomeSection.textContent?.includes('Breaking Through') ||
            welcomeSection.textContent?.includes('Digital Impasse')
          )
          
          // Make images smaller in Welcome section
          if (isWelcomeSection) {
            const imgElement = img as HTMLImageElement
            const originalWidth = parseInt(img.getAttribute('width') || (imgElement.offsetWidth ? imgElement.offsetWidth.toString() : '200'))
            const originalHeight = parseInt(img.getAttribute('height') || (imgElement.offsetHeight ? imgElement.offsetHeight.toString() : '50'))
            
            // Reduce size by 30% for Welcome section images
            const width = Math.round(originalWidth * 0.7)
            const height = Math.round(originalHeight * 0.7)
            
            const currentStyle = img.getAttribute('style') || ''
            img.setAttribute('width', width.toString())
            img.setAttribute('height', height.toString())
            img.setAttribute('style', `width: ${width}px; height: ${height}px; max-width: ${width}px; object-fit: contain; ${currentStyle}`)
          }
          
          // Fix logo carousel slider images - make them smaller
          const isInLogoCarousel = img.closest('.bdt-logo-carousel-wrapper') !== null ||
                                   img.closest('.bdt-logo-carousel-item') !== null ||
                                   img.classList.contains('bdt-logo-carousel-img')
          
          if (isInLogoCarousel) {
            const imgElement = img as HTMLImageElement
            const currentStyle = img.getAttribute('style') || ''
            imgElement.style.maxWidth = '200px'
            imgElement.style.maxHeight = '100px'
            imgElement.style.width = 'auto'
            imgElement.style.height = 'auto'
            imgElement.style.objectFit = 'contain'
            img.setAttribute('style', `max-width: 200px; max-height: 100px; width: auto; height: auto; object-fit: contain; ${currentStyle}`)
          }
          
          // Replace logo images in header/footer with custom SVG logo
          const srcLower = src.toLowerCase()
          const isLogoImage = srcLower.includes('allure') && 
                            (srcLower.includes('logo') || 
                             srcLower.includes('asset-1') ||
                             srcLower.includes('symbol'))
          
          const isInHeader = img.closest('header') !== null || 
                           img.closest('[data-elementor-type="header"]') !== null ||
                           img.closest('[class*="elementor-location-header" i]') !== null
          
          const isInFooter = img.closest('footer') !== null ||
                           img.closest('[class*="footer" i]') !== null
          
          const hasLogoClass = img.closest('[class*="logo" i]') !== null || 
                              img.closest('[class*="brand" i]') !== null ||
                              img.closest('[class*="site-logo" i]') !== null ||
                              img.closest('[class*="elementor-widget-image" i]') !== null
          
          // Replace logo images with small logo from public folder (1.png)
          if (isLogoImage && (isInHeader || isInFooter || hasLogoClass)) {
            const parent = img.parentElement
            if (parent) {
              const imgElement = img as HTMLImageElement
              const originalWidth = parseInt(img.getAttribute('width') || (imgElement.offsetWidth ? imgElement.offsetWidth.toString() : '200'))
              const originalHeight = parseInt(img.getAttribute('height') || (imgElement.offsetHeight ? imgElement.offsetHeight.toString() : '50'))
              
              // Reduce size significantly for navbar to maintain original height
              // For header/navbar, use much smaller size (30%); for footer, use even smaller
              const sizeMultiplier = isInHeader ? 0.3 : (isInFooter ? 0.25 : 0.3)
              const width = Math.round(originalWidth * sizeMultiplier)
              const height = Math.round(originalHeight * sizeMultiplier)
              
              const classes = img.getAttribute('class') || ''
              const style = img.getAttribute('style') || ''
              const alt = img.getAttribute('alt') || 'Rimalweb'
              
              // Create new image element with small logo (1.png) to keep navbar height small
              const newLogo = document.createElement('img')
              newLogo.src = '/1.png'
              newLogo.setAttribute('width', width.toString())
              newLogo.setAttribute('height', height.toString())
              newLogo.setAttribute('alt', alt)
              newLogo.setAttribute('class', classes)
              
              // Make footer logo transparent
              const opacityStyle = isInFooter ? 'opacity: 0.5; ' : ''
              // Keep header logo aligned properly without extra margins
              const headerPositionStyle = isInHeader ? 'vertical-align: middle; ' : ''
              // Add style with smaller size to maintain navbar original height
              newLogo.setAttribute('style', `width: ${width}px; height: ${height}px; max-width: ${width}px; max-height: ${height}px; object-fit: contain; ${opacityStyle}${headerPositionStyle}${style}`)
              
              // Preserve parent link if exists
              if (parent.tagName === 'A') {
                const link = parent.cloneNode(false) as HTMLAnchorElement
                Array.from(parent.attributes).forEach(attr => {
                  link.setAttribute(attr.name, attr.value)
                })
                link.appendChild(newLogo)
                parent.parentElement?.replaceChild(link, parent)
              } else {
                parent.replaceChild(newLogo, img)
              }
            }
          }
        }
      })

      // Fix CSS links in body
      body.querySelectorAll('link[href]').forEach((link) => {
        const href = link.getAttribute('href')
        if (href) {
          link.setAttribute('href', fixAssetUrl(href))
        }
      })

      // Fix background images in style attributes
      body.querySelectorAll('[style*="background"]').forEach((el) => {
        const style = el.getAttribute('style') || ''
        const newStyle = style.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, url) => {
          const fixed = fixAssetUrl(url)
          return `url('${fixed}')`
        })
        el.setAttribute('style', newStyle)
      })

      // Fix internal links and replace contact links with dummy data
      body.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href')
        
        // Remove Facebook and Instagram links
        if (href && (
          href.includes('facebook.com') ||
          href.includes('fb.com') ||
          href.includes('instagram.com') ||
          href.includes('facebook.net') ||
          href.toLowerCase().includes('facebook') ||
          href.toLowerCase().includes('instagram')
        )) {
          // Remove the link but keep the text
          a.removeAttribute('href')
          const linkEl = a as HTMLElement
          linkEl.style.pointerEvents = 'none'
          linkEl.style.cursor = 'default'
          linkEl.style.textDecoration = 'none'
          return
        }
        
        // Remove Google Maps links and location links
        if (href && (
          href.includes('maps.google.com') ||
          href.includes('maps.googleapis.com') ||
          href.includes('google.com/maps') ||
          href.includes('goo.gl/maps') ||
          href.includes('maps.app.goo.gl') ||
          href.toLowerCase().includes('find us on google map') ||
          href.toLowerCase().includes('find us on map') ||
          href.toLowerCase().includes('our location') ||
          href.toLowerCase().includes('get directions') ||
          (href.includes('q=') && (href.includes('Brooklyn') || href.includes('5300') || href.includes('Kings Highway')))
        )) {
          // Remove the link but keep the text
          a.removeAttribute('href')
          const linkEl = a as HTMLElement
          linkEl.style.pointerEvents = 'none'
          linkEl.style.cursor = 'default'
          linkEl.style.textDecoration = 'none'
          return
        }
        
        // Replace tel: and mailto: links with dummy data
        if (href && href.startsWith('tel:')) {
          const dummyPhone = '+1 (555) 123-4567'
          a.setAttribute('href', `tel:${dummyPhone.replace(/\s/g, '').replace(/[()]/g, '').replace(/-/g, '')}`)
        } else if (href && href.startsWith('mailto:')) {
          const dummyEmail = 'info@rimalweb.com'
          // Replace old email with dummy email
          if (href.includes('alluredigital.net')) {
            a.setAttribute('href', `mailto:${dummyEmail}`)
          } else {
            // Keep existing email if it's not alluredigital.net
            a.setAttribute('href', href.replace(/mailto:[^@]+@alluredigital\.net/gi, `mailto:${dummyEmail}`))
          }
        } else if (href && href.includes('alluredigital.net')) {
          // Convert alluredigital.net URLs to local Next.js routes
          try {
            const url = new URL(href)
            let path = url.pathname
            
            // Remove trailing slash
            if (path.endsWith('/') && path !== '/') {
              path = path.slice(0, -1)
            }
            
            // Convert common WordPress paths to Next.js routes
            const routeMap: { [key: string]: string } = {
              '/social-media-management': '/social-media-management',
              '/social-media-marketing': '/social-media-management', // Map to existing page
              '/appian-development': '/appian-development',
              '/software-development': '/appian-development', // Map to appian-development page
              '/local-seo': '/local-seo',
              '/ppc-advertising': '/google-ads-management', // Map PPC to Google Ads Management
              '/google-ads-management': '/google-ads-management', // Map to Google Ads Management page
              '/wordpress-development': '/wordpress-development',
              '/shopify-development': '/shopify-development',
              '/bricks-builder-development': '/bricks-builder-development',
              '/crm-development': '/crm-development',
              '/google-map-optimization': '/google-map-optimization',
              '/small-business-seo-service': '/small-business-seo-service',
              '/local-business-citations-building': '/local-business-citations-building',
              '/landing-page-optimization': '/landing-page-optimization',
              '/technical-seo-service': '/technical-seo-service',
              '/contact-us': '/contact-us',
              '/who-we-are': '/who-we-are',
              '/portfolio': '/portfolio',
              '/work': '/work',
              '/blog': '/blog',
              '/careers': '/careers'
            }
            
            // Check if path exists in route map
            if (routeMap[path]) {
              a.setAttribute('href', routeMap[path])
            } else if (path.startsWith('/blog/')) {
              // Blog posts - keep the path as is
              a.setAttribute('href', path)
            } else if (path === '/' || path === '') {
              a.setAttribute('href', '/')
            } else {
              // For unknown routes, try to use the path directly
                a.setAttribute('href', path)
            }
          } catch (e) {
            // If URL parsing fails, try to extract path manually
            const pathMatch = href.match(/alluredigital\.net([^?#]*)/)
            if (pathMatch && pathMatch[1]) {
              let path = pathMatch[1]
              if (path.endsWith('/') && path !== '/') {
                path = path.slice(0, -1)
              }
              a.setAttribute('href', path || '/')
            }
          }
        }
      })

      // Replace branding - Allure Digital to Rimalweb (ONLY visible text, NOT URLs or assets)
      const replaceBranding = (html: string): string => {
        // Replace in text content using DOM manipulation for safety
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = html
        
        // Replace in all text nodes (but NOT in script, style, src, href, or URLs)
        const walker = document.createTreeWalker(
          tempDiv,
          NodeFilter.SHOW_TEXT,
          null
        )
        
        let node
        while (node = walker.nextNode()) {
          const parent = node.parentElement
          if (!parent) continue
          
          // Skip script, style, and elements with src/href (images, links, etc.)
          // BUT allow text inside links (like breadcrumbs) to be replaced
          if (parent.tagName === 'SCRIPT' || 
              parent.tagName === 'STYLE' ||
              parent.tagName === 'NOSCRIPT' ||
              (parent.hasAttribute('src') && parent.tagName !== 'A') ||
              (parent.closest('img') && !parent.closest('a[href]'))) {
            continue
          }
          
          // Allow replacement in link text (breadcrumbs, etc.) but not in href attributes
          if (parent.tagName === 'A' && parent.hasAttribute('href')) {
            // This is link text, we can replace it - continue to process
          } else if (parent.hasAttribute('href') && parent.tagName !== 'A') {
            continue
          }
          
          if (node.textContent) {
            let text = node.textContent
            // Don't trim - preserve whitespace for proper replacement
            
            // Only replace if it's plain text (not part of URL or path)
            if (!text.match(/https?:\/\//i) && 
                !text.match(/\/assets\//) &&
                !text.match(/\.(png|jpg|jpeg|gif|svg|css|js)/i) &&
                !text.match(/^\/[^\/]/)) {
              
              const originalText = text
              
              // Replace only the company name text (case insensitive, word boundaries)
              text = text.replace(/\bAllure Digital\b/gi, 'Rimalweb')
              text = text.replace(/\bAllureDigital\b/gi, 'Rimalweb')
              text = text.replace(/\ballure digital\b/gi, 'Rimalweb')
              
              if (text !== originalText) {
                node.textContent = text
              }
            }
          }
        }
        
        // Replace in title tag (visible in browser tab)
        tempDiv.querySelectorAll('title').forEach((title) => {
          if (title.textContent) {
            title.textContent = title.textContent
              .replace(/Allure Digital/gi, 'Rimalweb')
              .replace(/AllureDigital/gi, 'Rimalweb')
          }
        })
        
        // Replace in alt attributes (for accessibility)
        tempDiv.querySelectorAll('img[alt]').forEach((img) => {
          const alt = img.getAttribute('alt')
          if (alt && (alt.includes('Allure') || alt.includes('allure'))) {
            img.setAttribute('alt', alt
              .replace(/Allure Digital/gi, 'Rimalweb')
              .replace(/AllureDigital/gi, 'Rimalweb'))
          }
        })
        
        // Replace in heading elements (h1, h2, h3, etc.) - important for hero sections
        tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6, .elementor-heading-title, .bdt-ep-hover-box-title, [class*="heading"]').forEach((heading) => {
          if (heading.textContent) {
            const originalText = heading.textContent
            let newText = originalText
              .replace(/\bAllure Digital\b/gi, 'Rimalweb')
              .replace(/\bAllureDigital\b/gi, 'Rimalweb')
              .replace(/\ballure digital\b/gi, 'Rimalweb')
            
            if (newText !== originalText) {
              heading.textContent = newText
            }
          }
        })
        
        // Replace in span and div elements that might contain company name (for hero sections)
        tempDiv.querySelectorAll('span, div, p, li').forEach((el) => {
          // Skip if it's inside a link href or image src, but allow link text
          if (el.closest('img') && !el.closest('a[href]')) return
          
          // Process if it has text content
          if (el.textContent) {
            const originalText = el.textContent
            let newText = originalText
              .replace(/\bAllure Digital\b/gi, 'Rimalweb')
              .replace(/\bAllureDigital\b/gi, 'Rimalweb')
              .replace(/\ballure digital\b/gi, 'Rimalweb')
            
            if (newText !== originalText) {
              // Only replace if it's a leaf node or has minimal children
              if (el.children.length === 0) {
                el.textContent = newText
              } else {
                // For elements with children, replace in direct text nodes
                const directTextNodes = Array.from(el.childNodes).filter(node => node.nodeType === Node.TEXT_NODE)
                directTextNodes.forEach(textNode => {
                  if (textNode.textContent) {
                    const text = textNode.textContent
                    const replaced = text
                      .replace(/\bAllure Digital\b/gi, 'Rimalweb')
                      .replace(/\bAllureDigital\b/gi, 'Rimalweb')
                      .replace(/\ballure digital\b/gi, 'Rimalweb')
                    if (replaced !== text) {
                      textNode.textContent = replaced
                    }
                  }
                })
              }
            }
          }
        })
        
        // Replace in data attributes that might contain text
        tempDiv.querySelectorAll('[data-title], [data-text], [data-content], [data-name], [data-label]').forEach((el) => {
          ['data-title', 'data-text', 'data-content', 'data-name', 'data-label'].forEach((attr) => {
            const value = el.getAttribute(attr)
            if (value && (value.includes('Allure') || value.includes('allure'))) {
              el.setAttribute(attr, value
                .replace(/Allure Digital/gi, 'Rimalweb')
                .replace(/AllureDigital/gi, 'Rimalweb')
                .replace(/allure digital/gi, 'Rimalweb'))
            }
          })
        })
        
        // Replace in aria-labels and other accessibility attributes
        tempDiv.querySelectorAll('[aria-label], [title], [placeholder]').forEach((el) => {
          ['aria-label', 'title', 'placeholder'].forEach((attr) => {
            const value = el.getAttribute(attr)
            if (value && (value.includes('Allure') || value.includes('allure'))) {
              el.setAttribute(attr, value
                .replace(/Allure Digital/gi, 'Rimalweb')
                .replace(/AllureDigital/gi, 'Rimalweb')
                .replace(/allure digital/gi, 'Rimalweb'))
            }
          })
        })
        
        // Replace in script tags that contain JSON-LD or schema data
        tempDiv.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
          if (script.textContent) {
            try {
              const jsonData = JSON.parse(script.textContent)
              const jsonString = JSON.stringify(jsonData)
              
              if (jsonString.includes('Allure') || jsonString.includes('allure')) {
                // Recursively replace in JSON object
                const replaceInObject = (obj: any): any => {
                  if (typeof obj === 'string') {
                    return obj
                      .replace(/Allure Digital/gi, 'Rimalweb')
                      .replace(/AllureDigital/gi, 'Rimalweb')
                      .replace(/allure digital/gi, 'Rimalweb')
                      .replace(/alluredigital\.net/gi, 'rimalweb.com')
                  } else if (Array.isArray(obj)) {
                    return obj.map(replaceInObject)
                  } else if (obj && typeof obj === 'object') {
                    const replaced: any = {}
                    for (const key in obj) {
                      replaced[key] = replaceInObject(obj[key])
                    }
                    return replaced
                  }
                  return obj
                }
                
                const replaced = replaceInObject(jsonData)
                script.textContent = JSON.stringify(replaced)
              }
            } catch (e) {
              // If JSON parsing fails, do simple string replacement
              if (script.textContent.includes('Allure') || script.textContent.includes('allure')) {
                script.textContent = script.textContent
                  .replace(/Allure Digital/gi, 'Rimalweb')
                  .replace(/AllureDigital/gi, 'Rimalweb')
                  .replace(/allure digital/gi, 'Rimalweb')
                  .replace(/alluredigital\.net/gi, 'rimalweb.com')
              }
            }
          }
        })
        
        // Replace in all other attributes (catch-all)
        tempDiv.querySelectorAll('*').forEach((el) => {
          Array.from(el.attributes).forEach((attr) => {
            // Skip src, href, and other URL attributes (already handled)
            if (['src', 'href', 'srcset', 'data-src', 'data-srcset'].includes(attr.name)) {
              return
            }
            
            const value = attr.value
            if (value && (value.includes('Allure') || value.includes('allure'))) {
              const replaced = value
                .replace(/Allure Digital/gi, 'Rimalweb')
                .replace(/AllureDigital/gi, 'Rimalweb')
                .replace(/allure digital/gi, 'Rimalweb')
              
              if (replaced !== value) {
                el.setAttribute(attr.name, replaced)
              }
            }
          })
        })
        
        return tempDiv.innerHTML
      }

      // Replace contact info (phone, email, address) with dummy data
      const replaceContactInfo = (html: string): string => {
        // Dummy contact data
        const dummyPhone = '+1 (555) 123-4567'
        const dummyEmail = 'info@rimalweb.com'
        const dummyAddress = '123 Business Street, Suite 100, New York, NY 10001'
        
        // Replace phone numbers (all formats) with dummy phone
        html = html.replace(/\(212\)\s*301-7615/gi, dummyPhone)
        html = html.replace(/212-301-7615/gi, dummyPhone)
        html = html.replace(/\(212\)\s*301\s*7615/gi, dummyPhone)
        html = html.replace(/212\s*301\s*7615/gi, dummyPhone)
        html = html.replace(/tel:[\d\s\-\(\)]+/gi, (match) => {
          // Replace tel: links with dummy phone
          return match.replace(/[\d\s\-\(\)]+/g, dummyPhone.replace(/\s/g, '-').replace(/[()]/g, ''))
        })
        
        // Replace email addresses with dummy email
        html = html.replace(/info@alluredigital\.net/gi, dummyEmail)
        html = html.replace(/[a-zA-Z0-9._%+-]+@alluredigital\.net/gi, dummyEmail)
        html = html.replace(/mailto:([a-zA-Z0-9._%+-]+@alluredigital\.net)/gi, `mailto:${dummyEmail}`)
        
        // Replace addresses with dummy address
        html = html.replace(/5300\s*Kings\s*Highway\s*Brooklyn[^<]*/gi, dummyAddress)
        html = html.replace(/Brooklyn,\s*NY\s*11234/gi, 'New York, NY 10001')
        html = html.replace(/1000\s*Broadway,\s*Brooklyn,\s*NY\s*11211/gi, dummyAddress)
        
        // Replace contact info in text content
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = html
        tempDiv.querySelectorAll('*').forEach((el) => {
          if (el.textContent) {
            let text = el.textContent
            const originalText = text
            
            // Replace phone numbers
            text = text.replace(/\(212\)\s*301-7615/gi, dummyPhone)
            text = text.replace(/212-301-7615/gi, dummyPhone)
            text = text.replace(/\(212\)\s*301\s*7615/gi, dummyPhone)
            text = text.replace(/212\s*301\s*7615/gi, dummyPhone)
            
            // Replace emails
            text = text.replace(/info@alluredigital\.net/gi, dummyEmail)
            text = text.replace(/[a-zA-Z0-9._%+-]+@alluredigital\.net/gi, dummyEmail)
            
            // Replace addresses
            text = text.replace(/5300\s*Kings\s*Highway/gi, '123 Business Street, Suite 100')
            text = text.replace(/Brooklyn,\s*NY\s*11234/gi, 'New York, NY 10001')
            text = text.replace(/1000\s*Broadway,\s*Brooklyn,\s*NY\s*11211/gi, dummyAddress)
            
            if (text !== originalText && el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
              el.textContent = text.trim()
            } else if (text !== originalText) {
              // For elements with children, replace in direct text nodes
              const directTextNodes = Array.from(el.childNodes).filter(node => node.nodeType === Node.TEXT_NODE)
              directTextNodes.forEach(textNode => {
                if (textNode.textContent) {
                  let nodeText = textNode.textContent
                  const originalNodeText = nodeText
                  
                  nodeText = nodeText.replace(/\(212\)\s*301-7615/gi, dummyPhone)
                  nodeText = nodeText.replace(/212-301-7615/gi, dummyPhone)
                  nodeText = nodeText.replace(/info@alluredigital\.net/gi, dummyEmail)
                  nodeText = nodeText.replace(/5300\s*Kings\s*Highway/gi, '123 Business Street, Suite 100')
                  nodeText = nodeText.replace(/Brooklyn,\s*NY\s*11234/gi, 'New York, NY 10001')
                  
                  if (nodeText !== originalNodeText) {
                    textNode.textContent = nodeText
                  }
                }
              })
            }
          }
        })
        
        // Also replace in href attributes (tel: and mailto: links) and remove social media/Google Maps links
        tempDiv.querySelectorAll('a[href]').forEach((a) => {
          const href = a.getAttribute('href') || ''
          
          // Remove Facebook and Instagram links
          if (href && (
            href.includes('facebook.com') ||
            href.includes('fb.com') ||
            href.includes('instagram.com') ||
            href.includes('facebook.net') ||
            href.toLowerCase().includes('facebook') ||
            href.toLowerCase().includes('instagram')
          )) {
            a.removeAttribute('href')
            const htmlEl = a as HTMLElement
            htmlEl.style.pointerEvents = 'none'
            htmlEl.style.cursor = 'default'
            htmlEl.style.textDecoration = 'none'
            return
          }
          
          // Remove Google Maps links
          if (href && (
            href.includes('maps.google.com') ||
            href.includes('maps.googleapis.com') ||
            href.includes('google.com/maps') ||
            href.includes('goo.gl/maps') ||
            href.includes('maps.app.goo.gl') ||
            href.toLowerCase().includes('find us on google map') ||
            href.toLowerCase().includes('find us on map') ||
            href.toLowerCase().includes('our location') ||
            href.toLowerCase().includes('get directions') ||
            (href.includes('q=') && (href.includes('Brooklyn') || href.includes('5300') || href.includes('Kings Highway')))
          )) {
            a.removeAttribute('href')
            const htmlEl = a as HTMLElement
            htmlEl.style.pointerEvents = 'none'
            htmlEl.style.cursor = 'default'
            htmlEl.style.textDecoration = 'none'
            return
          }
          
          if (href.startsWith('tel:')) {
            a.setAttribute('href', `tel:${dummyPhone.replace(/\s/g, '').replace(/[()]/g, '').replace(/-/g, '')}`)
          } else if (href.startsWith('mailto:') && href.includes('alluredigital.net')) {
            a.setAttribute('href', `mailto:${dummyEmail}`)
          }
        })
        
        return tempDiv.innerHTML
      }

      // Set body content - fix asset URLs first, then replace branding, then remove contact info
      // First, fix all asset URLs in the body HTML string (BEFORE any text replacement)
      let bodyHtml = body.innerHTML
      
      // Fix URLs in data-settings attributes (JSON strings) - CRITICAL: Must be done first
      bodyHtml = bodyHtml.replace(/data-settings="([^"]*)"/gi, (match, jsonStr) => {
        try {
          // Decode HTML entities properly
          const decoded = jsonStr
            .replace(/&amp;/g, '&')  // Must decode &amp; first
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
          
          // Try to parse JSON to validate structure
          let parsed: any = null
          try {
            parsed = JSON.parse(decoded)
          } catch (parseError) {
            // If JSON is invalid, just fix URLs in the raw string without parsing
            let fixed = jsonStr.replace(/https?:\/\/([^"\/]+\.)?(alluredigital|rimalweb)\.net([^"]*)/gi, (urlMatch, subdomain, domain, path) => {
              // Case-insensitive check for rimalweb domain
              const urlToFix = /rimalweb/i.test(domain || urlMatch)
                ? urlMatch.replace(/rimalweb\.net/gi, 'alluredigital.net')
                : urlMatch
              const fixedUrl = fixAssetUrl(urlToFix)
              // Escape the fixed URL properly for JSON
              return fixedUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            })
            return `data-settings="${fixed}"`
          }
          
          // If JSON is valid, recursively fix URLs in all string values
          const fixUrlsInObject = (obj: any): any => {
            if (typeof obj === 'string') {
              // Fix URLs in string values (case-insensitive)
              return obj.replace(/https?:\/\/([^"\/]+\.)?(alluredigital|rimalweb)\.net([^"]*)/gi, (urlMatch, subdomain, domain, path) => {
                // Case-insensitive check for rimalweb domain
                const urlToFix = /rimalweb/i.test(domain || urlMatch)
                  ? urlMatch.replace(/rimalweb\.net/gi, 'alluredigital.net')
                  : urlMatch
                return fixAssetUrl(urlToFix)
              })
            } else if (Array.isArray(obj)) {
              return obj.map(fixUrlsInObject)
            } else if (obj && typeof obj === 'object') {
              const fixed: any = {}
              for (const key in obj) {
                fixed[key] = fixUrlsInObject(obj[key])
              }
              return fixed
            }
            return obj
          }
          
          // Keep original slideshow - don't replace with about-banner
          // Removed code that was replacing slideshow with about-banner image
          
          // Also fix classic background images
          if (parsed.background_background === 'classic' && parsed.background_image && parsed.background_image.url) {
            parsed.background_image.url = fixUrlsInObject(parsed.background_image.url)
          }
          
          const fixedObj = fixUrlsInObject(parsed)
          const fixedJson = JSON.stringify(fixedObj)
          
          // Re-encode for HTML attribute (properly escape)
          const reEncoded = fixedJson
            .replace(/&/g, '&amp;')  // Must encode & first
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
          
          return `data-settings="${reEncoded}"`
        } catch (e) {
          // If anything fails, return original to prevent breaking the page
          console.warn('Failed to process data-settings attribute:', e)
          return match
        }
      })
      
      // Fix URLs in src attributes (preserve exact URL format)
      bodyHtml = bodyHtml.replace(/src="([^"]*alluredigital\.net[^"]*)"/gi, (match, url) => {
        const fixed = fixAssetUrl(url)
        return `src="${fixed}"`
      })
      
      // Fix URLs in srcset attributes
      bodyHtml = bodyHtml.replace(/srcset="([^"]*)"/gi, (match, srcset) => {
        const fixedSrcset = srcset.split(',').map((src: string) => {
          const parts = src.trim().split(/\s+/)
          if (parts[0] && (/alluredigital\.net/i.test(parts[0]) || /rimalweb\.net/i.test(parts[0]))) {
            // If already has rimalweb.net (any case), convert back to alluredigital.net for filename
            let urlToFix = parts[0]
            if (/rimalweb\.net/i.test(parts[0])) {
              urlToFix = parts[0].replace(/rimalweb\.net/gi, 'alluredigital.net')
            }
            return fixAssetUrl(urlToFix) + (parts[1] ? ' ' + parts[1] : '')
          }
          return src.trim()
        }).join(', ')
        return `srcset="${fixedSrcset}"`
      })
      
      // Fix URLs in style background images (including inline styles in HTML)
      // IMPORTANT: Always convert rimalweb.net (any case) to alluredigital.net for asset filename lookup
      bodyHtml = bodyHtml.replace(/url\(['"]?([^'")]*(?:alluredigital|rimalweb)\.net[^'")]*)['"]?\)/gi, (match, url) => {
        // Convert rimalweb.net (any case variation) back to alluredigital.net for filename lookup
        let urlToFix = url
        if (/rimalweb\.net/gi.test(url)) {
          urlToFix = url.replace(/rimalweb\.net/gi, 'alluredigital.net')
        }
        const fixed = fixAssetUrl(urlToFix)
        return `url('${fixed}')`
      })
      
      // Also fix background-image in style attributes directly
      // IMPORTANT: Always convert rimalweb.net to alluredigital.net for asset filename lookup
      bodyHtml = bodyHtml.replace(/background-image:\s*url\(['"]?([^'")]*(?:alluredigital|rimalweb)\.net[^'")]*)['"]?\)/gi, (match, url) => {
        // ALWAYS convert rimalweb.net (any case) to alluredigital.net for asset filename lookup
        // Asset files are named with alluredigital.net, not rimalweb.net
        let urlToFix = url
        if (/rimalweb\.net/gi.test(url)) {
          urlToFix = url.replace(/rimalweb\.net/gi, 'alluredigital.net')
        }
        const fixed = fixAssetUrl(urlToFix)
        return `background-image: url('${fixed}')`
      })
      
      // Also fix any rimalweb.net URLs that might have been replaced in HTML (case-insensitive)
      bodyHtml = bodyHtml.replace(/src="([^"]*rimalweb\.net[^"]*)"/gi, (match, url) => {
        // Convert back to alluredigital.net for filename (handles all case variations)
        const urlToFix = url.replace(/rimalweb\.net/gi, 'alluredigital.net')
        const fixed = fixAssetUrl(urlToFix)
        return `src="${fixed}"`
      })
      
      // Fix href attributes with rimalweb.net URLs (case-insensitive)
      bodyHtml = bodyHtml.replace(/href="([^"]*rimalweb\.net[^"]*)"/gi, (match, url) => {
        // Convert back to alluredigital.net for filename (handles all case variations)
        const urlToFix = url.replace(/rimalweb\.net/gi, 'alluredigital.net')
        const fixed = fixAssetUrl(urlToFix)
        return `href="${fixed}"`
      })
      
      // CRITICAL: Final cleanup - catch any /assets/Rimalweb.net URLs that slipped through
      // This handles URLs that are already in /assets/ format but still have Rimalweb.net
      // Direct replacement of /assets/Rimalweb.net_ to /assets/alluredigital.net_ (case-insensitive)
      bodyHtml = bodyHtml.replace(/\/assets\/[Rr]imalweb\.net_/gi, '/assets/alluredigital.net_')
      bodyHtml = bodyHtml.replace(/\/assets\/[Rr]imal[Ww]eb\.net_/gi, '/assets/alluredigital.net_')
      
      // Also catch URLs in attribute values (src, href, style, etc.) that already have /assets/Rimalweb.net
      bodyHtml = bodyHtml.replace(/((?:src|href|srcset|style|data-[^=]*)=['"]([^'"]*))\/assets\/[Rr]imalweb\.net([^'"]*)/gi, (match, prefix, before, after) => {
        return prefix + '/assets/alluredigital.net' + after
      })
      
      // Catch in url() CSS functions
      bodyHtml = bodyHtml.replace(/url\(['"]?([^'"]*)\/assets\/[Rr]imalweb\.net([^'"]*)['"]?\)/gi, (match, before, after) => {
        return `url('${before}/assets/alluredigital.net${after}')`
      })
      
      // Now replace branding (this won't affect already-fixed URLs)
      let cleanedHtml = replaceBranding(bodyHtml)
      cleanedHtml = replaceContactInfo(cleanedHtml)
      
      // Modify homepage headings to avoid copyright (similar but different wording)
      const modifyHomepageHeadings = (html: string): string => {
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = html
        
        // Heading replacements (similar meaning, different wording)
        const headingReplacements: { [key: string]: string } = {
          'Let Us Help You': 'We\'re Here to Assist You',
          'Get a Tailored Approach with our Digital Marketing Agency in Brooklyn': 'Experience Customized Solutions with our Digital Marketing Agency in New York',
          'Get a Tailored Approach with our Digital Marketing Agency in Brooklyn NY': 'Experience Customized Solutions with our Digital Marketing Agency in New York',
          'Providing Innovative Digital Solutions for Clients since 2010': 'Delivering Cutting-Edge Digital Solutions for Businesses since 2015',
          'A Glimpse into the Brands That Became Successful with Us': 'Discover the Companies That Achieved Success with Us',
          'Our Working Philosophy': 'Our Approach to Success',
          'SEO - Turn Your Web Traffic Into Profits with SEO': 'SEO - Transform Your Website Visitors Into Revenue with SEO',
          'Unleash Your Business\'s Digital Potential with Our Services': 'Unlock Your Company\'s Digital Growth with Our Services',
          'WE SPECIALIZE IN': 'OUR EXPERTISE INCLUDES',
          'How Our Digital Marketing Creates a Strong Impact': 'How Our Digital Marketing Drives Powerful Results',
          'Think Big\nPlan Smart\nExecute Flawlessly': 'Dream Big\nStrategize Wisely\nDeliver Excellence'
        }
        
        // Replace in all heading elements (including ha-gradient-heading for SERVICES section)
        tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6, .elementor-heading-title, .ha-gradient-heading, .ep-heading').forEach((heading) => {
          if (heading.textContent) {
            let text = heading.textContent.trim()
            const originalText = text
            
            // Handle multi-line text (like "Unleash Your Business's Digital Potential with Our Services\n")
            text = text.replace(/\n\s*/g, ' ').trim()
            
            // Check for exact matches first
            if (headingReplacements[text]) {
              heading.textContent = headingReplacements[text]
              return
            }
            
            // Check for partial matches and replace
            for (const [original, replacement] of Object.entries(headingReplacements)) {
              if (text.includes(original)) {
                text = text.replace(original, replacement)
                if (text !== originalText) {
                  heading.textContent = text
                  return
                }
              }
            }
            
            // Also check trimmed original text
            const trimmedOriginal = originalText.replace(/\n\s*/g, ' ').trim()
            if (headingReplacements[trimmedOriginal]) {
              heading.textContent = headingReplacements[trimmedOriginal]
              return
            }
          }
        })
        
        // Also replace in data attributes that might contain heading text (like animated headlines)
        tempDiv.querySelectorAll('[data-settings]').forEach((el) => {
          const settings = el.getAttribute('data-settings')
          if (settings && settings.includes('rotating_text')) {
            try {
              const decoded = settings
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'")
              
              const parsed = JSON.parse(decoded)
              if (parsed.rotating_text) {
                let rotatingText = parsed.rotating_text
                if (rotatingText.includes('Think Big')) {
                  rotatingText = rotatingText.replace(/Think Big[\s\n]*Plan Smart[\s\n]*Execute Flawlessly/gi, 'Dream Big\nStrategize Wisely\nDeliver Excellence')
                  parsed.rotating_text = rotatingText
                  
                  const fixedJson = JSON.stringify(parsed)
                  const reEncoded = fixedJson
                    .replace(/&/g, '&amp;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                  
                  el.setAttribute('data-settings', reEncoded)
                }
              }
            } catch (e) {
              // Silently continue if JSON parsing fails
            }
          }
        })
        
        return tempDiv.innerHTML
      }
      
      // Check if this is the homepage (by checking URL or specific homepage content)
      const isHomepage = typeof window !== 'undefined' && (
        window.location.pathname === '/' || 
        window.location.pathname === '' ||
        bodyHtml.includes('Get a Tailored Approach') ||
        bodyHtml.includes('Welcome to') && bodyHtml.includes('Breaking Through')
      )
      
      // Only modify headings on homepage
      if (isHomepage) {
        cleanedHtml = modifyHomepageHeadings(cleanedHtml)
      }
      
      // FINAL SAFETY CHECK: One more pass to catch any remaining /assets/Rimalweb.net URLs
      // This is critical as some URLs might have been missed in previous steps
      cleanedHtml = cleanedHtml.replace(/\/assets\/[Rr]imal[Ww]?eb\.net_/gi, '/assets/alluredigital.net_')
      
      containerRef.current.innerHTML = cleanedHtml
      
      // Fix logo carousel slider images - make them smaller
      if (containerRef.current) {
        containerRef.current.querySelectorAll('.bdt-logo-carousel-wrapper img, .bdt-logo-carousel-item img, .bdt-logo-carousel-img').forEach((img) => {
          const imgEl = img as HTMLImageElement
          imgEl.style.maxWidth = '200px'
          imgEl.style.maxHeight = '100px'
          imgEl.style.width = 'auto'
          imgEl.style.height = 'auto'
          imgEl.style.objectFit = 'contain'
        })
      }
      
      // Fix hover box images - ensure they work on hover
      if (containerRef.current) {
        const hoverBoxes = containerRef.current.querySelectorAll('.bdt-ep-hover-box')
        hoverBoxes.forEach((hoverBox) => {
          const hoverBoxEl = hoverBox as HTMLElement
          const hoverItems = hoverBoxEl.querySelectorAll('.bdt-ep-hover-box-item')
          const hoverContents = hoverBoxEl.querySelectorAll('.bdt-ep-hover-box-content')
          
          // Initialize - show first content by default
          if (hoverContents.length > 0) {
            hoverContents.forEach((content, index) => {
              const contentEl = content as HTMLElement
              if (index === 0) {
                contentEl.classList.add('bdt-active')
                contentEl.style.opacity = '1'
                contentEl.style.visibility = 'visible'
                contentEl.style.display = 'block'
                contentEl.style.zIndex = '10'
                
                // Ensure first image is visible
                const img = contentEl.querySelector('.bdt-ep-hover-box-img') as HTMLElement
                if (img) {
                  img.style.opacity = '1'
                  img.style.visibility = 'visible'
                  img.style.display = 'block'
                  img.style.backgroundSize = 'cover'
                  img.style.backgroundPosition = 'center'
                  img.style.backgroundRepeat = 'no-repeat'
                }
              } else {
                contentEl.classList.remove('bdt-active')
                contentEl.style.opacity = '0'
                contentEl.style.visibility = 'hidden'
                contentEl.style.display = 'none'
                contentEl.style.zIndex = '1'
              }
            })
          }
          
          // Helper function to show hover content by data-id
          const showHoverContent = (dataId: string) => {
            // Hide all contents first
            hoverContents.forEach((content) => {
              const contentEl = content as HTMLElement
              contentEl.classList.remove('bdt-active')
              contentEl.style.opacity = '0'
              contentEl.style.visibility = 'hidden'
              contentEl.style.display = 'none'
              contentEl.style.zIndex = '1'
              
              // Hide images inside
              const img = contentEl.querySelector('.bdt-ep-hover-box-img') as HTMLElement
              if (img) {
                img.style.opacity = '0'
                img.style.visibility = 'hidden'
                img.style.display = 'none'
              }
            })
            
            // Show corresponding content
            const targetContent = hoverBoxEl.querySelector(`#${dataId}`) as HTMLElement
            if (targetContent) {
              targetContent.classList.add('bdt-active')
              targetContent.style.opacity = '1'
              targetContent.style.visibility = 'visible'
              targetContent.style.display = 'block'
              targetContent.style.zIndex = '10'
              
              // Ensure the image inside is visible and loaded
              const img = targetContent.querySelector('.bdt-ep-hover-box-img') as HTMLElement
              if (img) {
                // Get background image URL from style attribute
                const styleAttr = img.getAttribute('style') || ''
                const bgMatch = styleAttr.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i)
                let imgUrl = bgMatch ? bgMatch[1] : null
                
                // If no URL in style, check computed style
                if (!imgUrl) {
                  const computedStyle = window.getComputedStyle(img)
                  const bgImage = computedStyle.backgroundImage
                  if (bgImage && bgImage !== 'none') {
                    const urlMatch = bgImage.match(/url\(['"]?([^'")]+)['"]?\)/i)
                    imgUrl = urlMatch ? urlMatch[1] : null
                  }
                }
                
                // Set image styles
                img.style.opacity = '1'
                img.style.visibility = 'visible'
                img.style.display = 'block'
                img.style.backgroundSize = 'cover'
                img.style.backgroundPosition = 'center'
                img.style.backgroundRepeat = 'no-repeat'
                
                // If we have a URL, ensure it's loaded
                if (imgUrl) {
                  // Fix URL if needed
                  // IMPORTANT: Always convert rimalweb.net to alluredigital.net for asset filename lookup
                  let fixedUrl = imgUrl
                  if (imgUrl && (/alluredigital\.net/i.test(imgUrl) || /rimalweb\.net/i.test(imgUrl))) {
                    // ALWAYS convert rimalweb.net (any case) to alluredigital.net - asset files use alluredigital.net
                    let urlToFix = imgUrl
                    if (/rimalweb\.net/i.test(imgUrl)) {
                      urlToFix = imgUrl.replace(/rimalweb\.net/gi, 'alluredigital.net')
                    }
                    fixedUrl = fixAssetUrl(urlToFix)
                  }
                  
                  // Set background image
                  img.style.backgroundImage = `url('${fixedUrl}')`
                  
                  // Preload to ensure it's loaded
                  const testImg = new Image()
                  testImg.onload = function() {
                    img.style.backgroundImage = `url('${fixedUrl}')`
                    img.style.opacity = '1'
                    img.style.visibility = 'visible'
                  }
                  testImg.onerror = function() {
                    // Try without size suffix
                    const altUrl = fixedUrl.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1')
                    if (altUrl !== fixedUrl) {
                      img.style.backgroundImage = `url('${altUrl}')`
                      const altTestImg = new Image()
                      altTestImg.onload = function() {
                        img.style.backgroundImage = `url('${altUrl}')`
                      }
                      altTestImg.src = altUrl
                    }
                  }
                  testImg.src = fixedUrl
                }
              }
            }
          }
          
          // Add hover event listeners to ALL items (all 5 services)
          // Services: bdt-box-10e85857, bdt-box-20e85857, bdt-box-30e85857, bdt-box-40e85857, bdt-box-50e85857
          hoverItems.forEach((item, index) => {
            const itemEl = item as HTMLElement
            const dataId = itemEl.getAttribute('data-id')
            
            if (dataId) {
              // Create hover handler function for this specific item
              const handleHover = () => {
                showHoverContent(dataId)
              }
              
              // Add hover to item itself
              itemEl.addEventListener('mouseenter', handleHover)
              
              itemEl.addEventListener('mouseleave', () => {
                // Keep the current hovered content visible when mouse leaves item
              })
              
              // Add hover to ALL title links inside the item
              // This ensures links work: .bdt-ep-hover-box-title-link, .bdt-ep-hover-box-title, a, h2
              const titleLinks = itemEl.querySelectorAll('.bdt-ep-hover-box-title-link, .bdt-ep-hover-box-title, a, h2, .ep-title')
              titleLinks.forEach((link) => {
                const linkEl = link as HTMLElement
                // Add multiple event types to ensure hover works on all links
                linkEl.addEventListener('mouseenter', (e) => {
                  e.stopPropagation()
                  handleHover()
                })
                linkEl.addEventListener('mouseover', (e) => {
                  e.stopPropagation()
                  handleHover()
                })
                linkEl.addEventListener('focus', (e) => {
                  e.stopPropagation()
                  handleHover()
                })
              })
              
              // Use event delegation on item - capture phase to catch all child events
              itemEl.addEventListener('mouseenter', (e) => {
                handleHover()
              }, true)
              
              itemEl.addEventListener('mouseover', (e) => {
                handleHover()
              }, true)
              
              // Add hover to parent wrapper if exists
              const itemWrap = itemEl.closest('.bdt-ep-hover-box-item-wrap')
              if (itemWrap && itemWrap !== itemEl) {
                itemWrap.addEventListener('mouseenter', handleHover)
              }
              
              // Also handle direct hover on any child element
              itemEl.addEventListener('mouseenter', handleHover)
            }
          })
          
          // Also handle hover box container mouse leave
          hoverBoxEl.addEventListener('mouseleave', () => {
            // Reset to first content when mouse leaves the entire hover box
            if (hoverContents.length > 0) {
              hoverContents.forEach((content, index) => {
                const contentEl = content as HTMLElement
                if (index === 0) {
                  contentEl.classList.add('bdt-active')
                  contentEl.style.opacity = '1'
                  contentEl.style.visibility = 'visible'
                  contentEl.style.display = 'block'
                  contentEl.style.zIndex = '10'
                  
                  // Ensure first image is visible
                  const img = contentEl.querySelector('.bdt-ep-hover-box-img') as HTMLElement
                  if (img) {
                    img.style.opacity = '1'
                    img.style.visibility = 'visible'
                    img.style.display = 'block'
                  }
                } else {
                  contentEl.classList.remove('bdt-active')
                  contentEl.style.opacity = '0'
                  contentEl.style.visibility = 'hidden'
                  contentEl.style.display = 'none'
                }
              })
            }
          })
          
          // Preload ALL hover box images to ensure they're ready
          hoverContents.forEach((content) => {
            const contentEl = content as HTMLElement
            const img = contentEl.querySelector('.bdt-ep-hover-box-img') as HTMLElement
            if (img) {
              const style = img.getAttribute('style') || ''
              const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i)
              if (bgMatch && bgMatch[1]) {
                let imgUrl = bgMatch[1]
                // Fix URL if needed
                // IMPORTANT: Always convert rimalweb.net (any case) to alluredigital.net for asset filename lookup
                if (imgUrl && (/alluredigital\.net/i.test(imgUrl) || /rimalweb\.net/i.test(imgUrl))) {
                  // ALWAYS convert rimalweb.net (any case) to alluredigital.net - asset files use alluredigital.net
                  let urlToFix = imgUrl
                  if (/rimalweb\.net/i.test(imgUrl)) {
                    urlToFix = imgUrl.replace(/rimalweb\.net/gi, 'alluredigital.net')
                  }
                  imgUrl = fixAssetUrl(urlToFix)
                }
                
                // Preload image
                const preloadImg = new Image()
                preloadImg.src = imgUrl
              }
            }
          })
        })
      }
      
      // Fix header and navbar width issues - ensure full width
      if (containerRef.current) {
        // Fix sticky header sections - make them full width
        containerRef.current.querySelectorAll('.elementor-sticky, .elementor-sticky--active, .elementor-sticky__spacer').forEach((el) => {
          const htmlEl = el as HTMLElement
          // Remove fixed width and set to 100%
          htmlEl.style.width = '100%'
          htmlEl.style.maxWidth = '100%'
          htmlEl.style.left = '0'
          htmlEl.style.right = '0'
          // Ensure proper positioning
          if (htmlEl.style.position === 'fixed' || htmlEl.classList.contains('elementor-sticky--active')) {
            htmlEl.style.position = 'fixed'
            htmlEl.style.top = '0'
            htmlEl.style.zIndex = '9999'
          }
        })
        
        // Fix header container width
        containerRef.current.querySelectorAll('header[data-elementor-type="header"]').forEach((header) => {
          const headerEl = header as HTMLElement
          headerEl.style.width = '100%'
          headerEl.style.maxWidth = '100%'
          headerEl.style.left = '0'
          headerEl.style.right = '0'
        })
        
        // Fix top banner section (black section) - ensure full width
        containerRef.current.querySelectorAll('.elementor-element-a6de6a2, [data-id="a6de6a2"]').forEach((el) => {
          const htmlEl = el as HTMLElement
          htmlEl.style.width = '100%'
          htmlEl.style.maxWidth = '100%'
          htmlEl.style.left = '0'
          htmlEl.style.right = '0'
          // Fix container inside
          const container = htmlEl.querySelector('.elementor-container')
          if (container) {
            const containerEl = container as HTMLElement
            containerEl.style.maxWidth = '100%'
            containerEl.style.width = '100%'
          }
        })
        
        // Fix navbar sections - ensure full width
        containerRef.current.querySelectorAll('header .elementor-section, header section').forEach((el) => {
          const htmlEl = el as HTMLElement
          // Only fix if it's a sticky or header section
          if (htmlEl.classList.contains('elementor-sticky') || 
              htmlEl.closest('header') !== null ||
              htmlEl.getAttribute('data-elementor-type') === 'section') {
            htmlEl.style.width = '100%'
            htmlEl.style.maxWidth = '100%'
            htmlEl.style.left = '0'
            htmlEl.style.right = '0'
          }
        })
        
        // Add global CSS to ensure header sections are full width
        const styleId = 'header-width-fix'
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style')
          style.id = styleId
          style.textContent = `
            /* Fix header and navbar width issues */
            header[data-elementor-type="header"],
            header .elementor-sticky,
            header .elementor-sticky--active,
            header .elementor-sticky__spacer,
            .elementor-element-a6de6a2,
            [data-id="a6de6a2"] {
              width: 100% !important;
              max-width: 100% !important;
              left: 0 !important;
              right: 0 !important;
            }
            
            /* Fix sticky header positioning */
            .elementor-sticky--active {
              position: fixed !important;
              top: 0 !important;
              z-index: 9999 !important;
              width: 100% !important;
              max-width: 100% !important;
            }
            
            /* Fix header container */
            header[data-elementor-type="header"] .elementor-container {
              max-width: 100% !important;
              width: 100% !important;
            }
            
            /* Ensure body doesn't have overflow issues */
            body {
              overflow-x: hidden !important;
            }
            
            /* Fix navbar when scrolling */
            .elementor-sticky--effects {
              width: 100% !important;
              max-width: 100% !important;
            }
            
            /* Fix all header sections to be full width */
            header .elementor-section {
              width: 100% !important;
              max-width: 100% !important;
            }
            
            /* Keep navbar logo very small to maintain navbar height */
            header img[src*="1.png"],
            header img[src*="/1.png"],
            header .elementor-widget-image img,
            header [class*="logo"] img {
              max-height: 40px !important;
              max-width: 150px !important;
              height: auto !important;
              width: auto !important;
              object-fit: contain !important;
            }
            
            /* Ensure navbar doesn't expand due to logo */
            header .elementor-widget-image {
              display: flex !important;
              align-items: center !important;
            }
            
            /* Fix offcanvas menu to show properly from right side */
            .bdt-offcanvas {
              position: fixed !important;
              top: 0 !important;
              right: 0 !important;
              left: auto !important;
              width: 400px !important;
              max-width: 90vw !important;
              height: 100vh !important;
              background: #fff !important;
              z-index: 10000 !important;
              transform: translateX(100%) !important;
              transition: transform 0.3s ease !important;
              overflow-y: auto !important;
              box-shadow: -2px 0 10px rgba(0,0,0,0.1) !important;
              display: none !important;
              visibility: hidden !important;
              opacity: 0 !important;
            }
            
            .bdt-offcanvas.bdt-open,
            .bdt-offcanvas[aria-hidden="false"],
            .bdt-offcanvas[style*="display: block"] {
              display: block !important;
              visibility: visible !important;
              opacity: 1 !important;
              transform: translateX(0) !important;
              right: 0 !important;
              left: auto !important;
            }
            
            /* Hide offcanvas by default - only show when opened */
            .bdt-offcanvas:not(.bdt-open):not([aria-hidden="false"]) {
              display: none !important;
              visibility: hidden !important;
            }
            
            .bdt-offcanvas-bar {
              padding: 30px !important;
              width: 100% !important;
              height: 100% !important;
            }
            
            /* Offcanvas overlay - REMOVED: No black overlay on page */
            .bdt-offcanvas-page::before {
              display: none !important;
              content: none !important;
              background: transparent !important;
            }
            
            /* Remove any black overlay from body when offcanvas is open */
            body.bdt-offcanvas-page {
              overflow: hidden !important;
            }
            
            body.bdt-offcanvas-page::before {
              display: none !important;
              content: none !important;
              background: transparent !important;
            }
            
            /* Hide any backdrop/overlay elements that cause white screen */
            .bdt-offcanvas-backdrop,
            .offcanvas-backdrop,
            [class*="overlay"],
            [class*="backdrop"] {
              display: none !important;
              visibility: hidden !important;
              opacity: 0 !important;
              background: transparent !important;
              pointer-events: none !important;
            }
            
            /* Ensure body has no white overlay when menu closes */
            body:not(.bdt-offcanvas-page) {
              background-color: transparent !important;
            }
            
            /* Hide Facebook and Instagram links and icons */
            a[href*="facebook"],
            a[href*="fb.com"],
            a[href*="instagram"],
            a[href*="Facebook"],
            a[href*="Instagram"],
            .elementor-icon-list-item a[href*="facebook"],
            .elementor-icon-list-item a[href*="instagram"],
            .social-icon[href*="facebook"],
            .social-icon[href*="instagram"],
            [class*="facebook"],
            [class*="instagram"]:has(a[href*="facebook"]),
            [class*="instagram"]:has(a[href*="instagram"]) {
              display: none !important;
              visibility: hidden !important;
              opacity: 0 !important;
              height: 0 !important;
              width: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            
            /* Offcanvas button styling */
            .bdt-offcanvas-button {
              cursor: pointer !important;
              display: inline-flex !important;
              align-items: center !important;
            }
            
            /* Ensure offcanvas content is visible */
            .bdt-offcanvas .elementor-section,
            .bdt-offcanvas .elementor-widget {
              opacity: 1 !important;
              visibility: visible !important;
            }
            
            /* Fix logo carousel slider images - make them smaller */
            .bdt-logo-carousel-wrapper .bdt-logo-carousel-img,
            .bdt-logo-carousel-item img,
            .bdt-logo-carousel-figure img {
              max-width: 200px !important;
              max-height: 100px !important;
              width: auto !important;
              height: auto !important;
              object-fit: contain !important;
            }
            
            .bdt-logo-carousel-item {
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
            }
            
            .bdt-logo-carousel-figure {
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              width: 100% !important;
              height: 100% !important;
            }
            
            /* Fix hover box images - ensure they are visible on hover */
            .bdt-ep-hover-box {
              position: relative !important;
            }
            
            .bdt-ep-hover-box-img {
              opacity: 1 !important;
              visibility: visible !important;
              background-size: cover !important;
              background-position: center !important;
              background-repeat: no-repeat !important;
              width: 100% !important;
              height: 100% !important;
              transition: opacity 0.3s ease !important;
            }
            
            /* Ensure hover box images don't get purple gradient - override any gradient */
            .bdt-ep-hover-box-img[style*="linear-gradient"] {
              background: transparent !important;
            }
            
            .bdt-ep-hover-box-content {
              opacity: 0 !important;
              visibility: hidden !important;
              transition: opacity 0.3s ease, visibility 0.3s ease !important;
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              height: 100% !important;
              z-index: 1 !important;
            }
            
            .bdt-ep-hover-box-content.bdt-active {
              opacity: 1 !important;
              visibility: visible !important;
              display: block !important;
              z-index: 10 !important;
            }
            
            .bdt-ep-hover-box-content.bdt-active .bdt-ep-hover-box-img {
              opacity: 1 !important;
              visibility: visible !important;
              display: block !important;
              background-size: cover !important;
              background-position: center !important;
              background-repeat: no-repeat !important;
              width: 100% !important;
              height: 100% !important;
            }
            
            /* Ensure hover works on all parts of the service item */
            .bdt-ep-hover-box-item,
            .bdt-ep-hover-box-item *,
            .bdt-ep-hover-box-title,
            .bdt-ep-hover-box-title-link {
              cursor: pointer !important;
            }
            
            .bdt-ep-hover-box-item:hover,
            .bdt-ep-hover-box-title:hover,
            .bdt-ep-hover-box-title-link:hover {
              opacity: 1 !important;
            }
            
            /* Make sure hover items trigger image change */
            .bdt-ep-hover-box-item-wrap {
              position: relative !important;
              z-index: 10 !important;
            }
            
            /* Hero Section Animations - Ensure animations work properly */
            .animated-fast,
            .animated-slow,
            .animated,
            .elementor-invisible {
              visibility: visible !important;
            }
            
            /* SlideInUp Animation */
            @keyframes slideInUp {
              from {
                opacity: 0;
                transform: translate3d(0, 40px, 0);
              }
              to {
                opacity: 1;
                transform: translate3d(0, 0, 0);
              }
            }
            
            .animated-slideInUp,
            .animated-fast.animated.slideInUp,
            .animated-slow.animated.fadeInLeft {
              animation-fill-mode: both;
            }
            
            .animated-fast {
              animation-duration: 0.6s !important;
            }
            
            .animated-slow {
              animation-duration: 1s !important;
            }
            
            .elementor-widget[data-settings*="_animation"]:not(.elementor-invisible),
            .elementor-widget.animated-fast:not(.elementor-invisible),
            .elementor-widget.animated-slow:not(.elementor-invisible) {
              opacity: 1 !important;
              visibility: visible !important;
            }
            
            /* FadeInLeft Animation */
            @keyframes fadeInLeft {
              from {
                opacity: 0;
                transform: translate3d(-40px, 0, 0);
              }
              to {
                opacity: 1;
                transform: translate3d(0, 0, 0);
              }
            }
            
            /* FadeInUp Animation */
            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translate3d(0, 40px, 0);
              }
              to {
                opacity: 1;
                transform: translate3d(0, 0, 0);
              }
            }
            
            .animated-fadeInLeft {
              animation-name: fadeInLeft;
              animation-fill-mode: both;
            }
            
            .animated-fadeInUp {
              animation-name: fadeInUp;
              animation-fill-mode: both;
            }
            
            /* Animated Headline - Rotating Text */
            .elementor-headline {
              display: inline-block;
              margin-top: 15px !important;
              padding-top: 0 !important;
              overflow: visible !important;
              white-space: nowrap !important;
            }
            
            .elementor-headline-text-wrapper {
              display: inline-block;
              position: relative;
              width: auto !important;
              min-width: fit-content !important;
              overflow: visible !important;
              white-space: nowrap !important;
            }
            
            .elementor-headline-dynamic-text {
              opacity: 0;
              position: absolute;
              top: 0;
              left: 0;
              white-space: nowrap !important;
              overflow: visible !important;
              width: auto !important;
            }
            
            .elementor-headline-text-active {
              opacity: 1;
              position: relative;
              white-space: nowrap !important;
              overflow: visible !important;
              width: auto !important;
            }
            
            .elementor-headline-dynamic-wrapper {
              width: auto !important;
              min-width: fit-content !important;
              overflow: visible !important;
              white-space: nowrap !important;
            }
            
            /* Add spacing to animated headline widget container */
            .elementor-widget-animated-headline {
              margin-top: 15px !important;
            }
            
            .elementor-widget-animated-headline .elementor-widget-container {
              margin-top: 15px !important;
            }
            
            /* Hero Section Fonts */
            body,
            .elementor-heading-title,
            .elementor-widget-heading .elementor-heading-title,
            h1, h2, h3, h4, h5, h6 {
              font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif !important;
            }
            
            .elementor-headline,
            .elementor-headline-dynamic-text {
              font-family: 'Montserrat', sans-serif !important;
            }
            
            /* Ensure Poppins is used where specified */
            [style*="font-family: Poppins"],
            [style*="font-family: 'Poppins'"],
            [style*="Poppins-Bold"],
            [style*="Poppins-SemiBold"] {
              font-family: 'Poppins', sans-serif !important;
            }
            
            /* Hero Section Slideshow - Ensure only one slide is visible at a time */
            .elementor-background-slideshow {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              height: 100% !important;
              z-index: 0 !important;
            }
            
            .elementor-background-slideshow .swiper-wrapper {
              position: relative !important;
              width: 100% !important;
              height: 100% !important;
            }
            
            .elementor-background-slideshow__slide {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              height: 100% !important;
              opacity: 0 !important;
              transition: opacity 1.8s ease !important;
            }
            
            /* Only active/visible slides should be visible */
            .elementor-background-slideshow__slide.swiper-slide-active,
            .elementor-background-slideshow__slide.swiper-slide-visible {
              opacity: 1 !important;
              z-index: 1 !important;
            }
            
            /* Hide duplicate slides but keep them for loop */
            .elementor-background-slideshow__slide.swiper-slide-duplicate {
              opacity: 0 !important;
              visibility: hidden !important;
              display: block !important; /* Keep display for loop */
            }
            
            /* Ensure slide images fill properly */
            .elementor-background-slideshow__slide__image {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              height: 100% !important;
              background-size: cover !important;
              background-position: center !important;
              background-repeat: no-repeat !important;
            }
            
            /* Hide phone and email in hero section */
            [data-id="82105a4"] .elementor-icon-list-item,
            [data-id="15371e5"] .elementor-icon-list-item {
              /* Hide items containing phone or email */
            }
            
            [data-id="82105a4"] .elementor-icon-list-item:has(a[href*="tel:"]),
            [data-id="15371e5"] .elementor-icon-list-item:has(a[href*="tel:"]),
            [data-id="82105a4"] .elementor-icon-list-item:has(a[href*="mailto:"]),
            [data-id="15371e5"] .elementor-icon-list-item:has(a[href*="mailto:"]) {
              display: none !important;
              visibility: hidden !important;
              opacity: 0 !important;
              height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
            
            /* Hide icon list widgets that contain only phone/email */
            [data-id="82105a4"] .elementor-icon-list:has(.elementor-icon-list-item:only-child a[href*="tel:"]),
            [data-id="15371e5"] .elementor-icon-list:has(.elementor-icon-list-item:only-child a[href*="tel:"]),
            [data-id="82105a4"] .elementor-icon-list:has(.elementor-icon-list-item:only-child a[href*="mailto:"]),
            [data-id="15371e5"] .elementor-icon-list:has(.elementor-icon-list-item:only-child a[href*="mailto:"]) {
              display: none !important;
              visibility: hidden !important;
              opacity: 0 !important;
              height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            
            /* Hide specific widget IDs that might contain phone/email */
            [data-id="82105a4"] [data-id="0d5e304"],
            [data-id="82105a4"] [data-id="c06f9c4"],
            [data-id="15371e5"] [data-id="0d5e304"],
            [data-id="15371e5"] [data-id="c06f9c4"] {
              display: none !important;
              visibility: hidden !important;
              opacity: 0 !important;
              height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
          `
          document.head.appendChild(style)
        }
        
        // Add scroll listener to continuously fix width on scroll
        const fixHeaderWidth = () => {
          if (!containerRef.current) return
          
          // Fix all sticky elements on scroll
          containerRef.current.querySelectorAll('.elementor-sticky, .elementor-sticky--active, .elementor-sticky__spacer').forEach((el) => {
            const htmlEl = el as HTMLElement
            htmlEl.style.width = '100%'
            htmlEl.style.maxWidth = '100%'
            htmlEl.style.left = '0'
            htmlEl.style.right = '0'
          })
          
          // Fix header sections
          containerRef.current.querySelectorAll('header .elementor-section').forEach((el) => {
            const htmlEl = el as HTMLElement
            htmlEl.style.width = '100%'
            htmlEl.style.maxWidth = '100%'
          })
        }
        
        // Run on scroll with throttling
        const scrollHandler = () => {
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
          scrollTimeoutRef.current = setTimeout(fixHeaderWidth, 10)
        }
        window.addEventListener('scroll', scrollHandler, { passive: true })
        
        // Also run on resize
        window.addEventListener('resize', fixHeaderWidth, { passive: true })
        
        // Store cleanup function in ref
        cleanupRef.current = () => {
          window.removeEventListener('scroll', scrollHandler)
          window.removeEventListener('resize', fixHeaderWidth)
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current)
            scrollTimeoutRef.current = null
          }
        }
      }
      
        // Initialize Hero Section Animations
        if (containerRef.current) {
          // Remove elementor-invisible from hero section elements
          const heroSections = containerRef.current.querySelectorAll('[data-id="82105a4"], [data-id="15371e5"]')
          heroSections.forEach((heroSection) => {
            // Hide phone and email icon lists in hero section
            const phoneEmailElements = heroSection.querySelectorAll('.elementor-icon-list-item')
            phoneEmailElements.forEach((el) => {
              const htmlEl = el as HTMLElement
              const text = htmlEl.textContent || ''
              const href = htmlEl.querySelector('a')?.getAttribute('href') || ''
              // Hide if contains phone number or email
              if (text.includes('(212)') || text.includes('301-7615') || text.includes('@') || text.includes('tel:') || text.includes('mailto:')) {
                htmlEl.style.display = 'none'
                htmlEl.style.visibility = 'hidden'
                htmlEl.style.opacity = '0'
                htmlEl.style.height = '0'
                htmlEl.style.margin = '0'
                htmlEl.style.padding = '0'
              }
              // Hide if contains Facebook or Instagram links
              if (href.includes('facebook') || href.includes('fb.com') || href.includes('instagram') || 
                  text.toLowerCase().includes('facebook') || text.toLowerCase().includes('instagram')) {
                htmlEl.style.display = 'none'
                htmlEl.style.visibility = 'hidden'
                htmlEl.style.opacity = '0'
                htmlEl.style.height = '0'
                htmlEl.style.margin = '0'
                htmlEl.style.padding = '0'
              }
            })
            
            // Also hide parent icon-list containers if they only contain phone/email
            const iconLists = heroSection.querySelectorAll('.elementor-icon-list')
            iconLists.forEach((iconList) => {
              const listEl = iconList as HTMLElement
              const items = listEl.querySelectorAll('.elementor-icon-list-item')
              let allHidden = true
              items.forEach((item) => {
                const itemEl = item as HTMLElement
                if (itemEl.style.display !== 'none') {
                  allHidden = false
                }
              })
              if (allHidden && items.length > 0) {
                listEl.style.display = 'none'
                listEl.style.visibility = 'hidden'
                listEl.style.opacity = '0'
                listEl.style.height = '0'
                listEl.style.margin = '0'
                listEl.style.padding = '0'
              }
            })
            
          heroSection.querySelectorAll('.elementor-invisible, .animated-fast, .animated-slow, .animated').forEach((el) => {
            const htmlEl = el as HTMLElement
            
            // Remove invisible class
            el.classList.remove('elementor-invisible')
            
            // Get animation settings
            const settings = htmlEl.getAttribute('data-settings')
            if (settings) {
              try {
                const decoded = settings
                  .replace(/&quot;/g, '"')
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                const parsed = JSON.parse(decoded)
                
                if (parsed._animation) {
                  const animationType = parsed._animation
                  const animationDelay = parsed._animation_delay || 0
                  
                  // Apply animation
                  setTimeout(() => {
                    htmlEl.style.visibility = 'visible'
                    htmlEl.style.opacity = '1'
                    
                    // Add animation classes
                    if (animationType === 'slideInUp') {
                      htmlEl.style.animation = `slideInUp 0.6s ease-out ${animationDelay}ms both`
                    } else if (animationType === 'fadeInLeft') {
                      htmlEl.style.animation = `fadeInLeft 1s ease-out ${animationDelay}ms both`
                    } else if (animationType === 'fadeInUp') {
                      htmlEl.style.animation = `fadeInUp 0.6s ease-out ${animationDelay}ms both`
                    }
                  }, animationDelay)
                } else {
                  // No animation delay, show immediately
                  htmlEl.style.visibility = 'visible'
                  htmlEl.style.opacity = '1'
                }
              } catch (e) {
                // If parsing fails, just make visible
                htmlEl.style.visibility = 'visible'
                htmlEl.style.opacity = '1'
              }
            } else {
              // No settings, make visible immediately
              htmlEl.style.visibility = 'visible'
              htmlEl.style.opacity = '1'
            }
          })
        })
        
        // Initialize Animated Headline (rotating text) for hero section
        const animatedHeadlines = containerRef.current.querySelectorAll('.elementor-headline')
        animatedHeadlines.forEach((headline) => {
          const headlineEl = headline as HTMLElement
          const widgetEl = headlineEl.closest('[data-settings*="rotating_text"]') as HTMLElement
          const settings = widgetEl?.getAttribute('data-settings')
          
          if (settings && widgetEl) {
            try {
              // Remove elementor-invisible class from widget and headline
              widgetEl.classList.remove('elementor-invisible')
              headlineEl.classList.remove('elementor-invisible')
              
              const decoded = settings
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&#39;/g, "'")
              const parsed = JSON.parse(decoded)
              
              if (parsed.rotating_text) {
                // Ensure headline is visible and add spacing
                headlineEl.style.visibility = 'visible'
                headlineEl.style.opacity = '1'
                headlineEl.style.marginTop = '15px'
                
                widgetEl.style.visibility = 'visible'
                widgetEl.style.opacity = '1'
                widgetEl.style.marginTop = '15px'
                
                // Also add margin to widget container
                const widgetContainer = widgetEl.querySelector('.elementor-widget-container') as HTMLElement
                if (widgetContainer) {
                  widgetContainer.style.marginTop = '15px'
                }
                
                // Get all text spans
                const textSpans = headlineEl.querySelectorAll('.elementor-headline-dynamic-text') as NodeListOf<HTMLElement>
                
                // Fix text wrapper width to show full text
                const textWrapper = headlineEl.querySelector('.elementor-headline-text-wrapper') as HTMLElement
                if (textWrapper) {
                  // Remove fixed width to allow text to expand
                  textWrapper.style.width = 'auto'
                  textWrapper.style.minWidth = 'fit-content'
                  textWrapper.style.overflow = 'visible'
                  textWrapper.style.whiteSpace = 'nowrap'
                }
                
                // Fix dynamic wrapper width
                const dynamicWrapper = headlineEl.querySelector('.elementor-headline-dynamic-wrapper') as HTMLElement
                if (dynamicWrapper) {
                  dynamicWrapper.style.width = 'auto'
                  dynamicWrapper.style.minWidth = 'fit-content'
                  dynamicWrapper.style.overflow = 'visible'
                  dynamicWrapper.style.whiteSpace = 'nowrap'
                }
                
                // Ensure headline itself doesn't clip
                headlineEl.style.overflow = 'visible'
                headlineEl.style.whiteSpace = 'nowrap'
                
                if (textSpans.length > 1) {
                  // Get rotation settings
                  const loop = parsed.loop !== 'no'
                  const iterationDelay = parsed.rotate_iteration_delay || 2500
                  const animationType = parsed.animation_type || 'clip'
                  
                  // Clear any existing interval for this headline
                  const headlineId = widgetEl.getAttribute('data-id') || 'default'
                  if ((window as any)[`headlineInterval_${headlineId}`]) {
                    clearInterval((window as any)[`headlineInterval_${headlineId}`])
                  }
                  
                  let currentIndex = 0
                  
                  // Find initial active text and ensure all text spans are properly styled
                  let maxWidth = 0
                  textSpans.forEach((span, idx) => {
                    // Fix each text span to show full text
                    span.style.overflow = 'visible'
                    span.style.whiteSpace = 'nowrap'
                    span.style.width = 'auto'
                    span.style.textOverflow = 'clip'
                    
                    const isActive = span.classList.contains('elementor-headline-text-active')
                    
                    if (isActive) {
                      // Active text should be visible and relative positioned
                      span.style.visibility = 'visible'
                      span.style.opacity = '1'
                      span.style.display = 'block'
                      span.style.position = 'relative'
                      span.style.zIndex = '2'
                      currentIndex = idx
                    } else {
                      // Inactive texts should be hidden and absolutely positioned
                      span.style.visibility = 'hidden'
                      span.style.opacity = '0'
                      span.style.display = 'none' // Hide completely to avoid duplication
                      span.style.position = 'absolute'
                      span.style.zIndex = '0'
                    }
                    
                    // Temporarily make visible only to measure width
                    const originalVisibility = span.style.visibility
                    const originalDisplay = span.style.display
                    const originalPosition = span.style.position
                    
                    span.style.visibility = 'visible'
                    span.style.opacity = '1'
                    span.style.display = 'block'
                    span.style.position = 'relative'
                    
                    // Measure text width
                    const textWidth = span.offsetWidth || span.scrollWidth || 0
                    if (textWidth > maxWidth) {
                      maxWidth = textWidth
                    }
                    
                    // Restore to original state
                    span.style.visibility = originalVisibility
                    span.style.display = originalDisplay
                    span.style.position = originalPosition
                  })
                  
                  // Set wrapper to fit the longest text
                  if (textWrapper && maxWidth > 0) {
                    textWrapper.style.width = 'auto'
                    textWrapper.style.minWidth = `${maxWidth}px`
                  }
                  
                  if (dynamicWrapper && maxWidth > 0) {
                    dynamicWrapper.style.width = 'auto'
                    dynamicWrapper.style.minWidth = `${maxWidth}px`
                  }
                  
                  // Function to rotate to next text
                  const rotateText = () => {
                    if (!loop && currentIndex >= textSpans.length - 1) {
                      return // Stop if loop is disabled and reached end
                    }
                    
                    // Remove active class from current and hide it
                    textSpans.forEach((span) => {
                      span.classList.remove('elementor-headline-text-active')
                      span.classList.add('elementor-headline-text-inactive')
                      // Hide inactive text completely to prevent duplication
                      span.style.visibility = 'hidden'
                      span.style.opacity = '0'
                      span.style.display = 'none'
                      span.style.position = 'absolute'
                      span.style.zIndex = '0'
                    })
                    
                    // Move to next (with loop)
                    currentIndex = (currentIndex + 1) % textSpans.length
                    
                    // Add active class to new text and show it
                    const nextSpan = textSpans[currentIndex]
                    if (nextSpan) {
                      nextSpan.classList.remove('elementor-headline-text-inactive')
                      nextSpan.classList.add('elementor-headline-text-active')
                      
                      // Show only the active text
                      nextSpan.style.visibility = 'visible'
                      nextSpan.style.opacity = '1'
                      nextSpan.style.display = 'block'
                      nextSpan.style.position = 'relative'
                      nextSpan.style.zIndex = '2'
                      
                      // Ensure wrapper expands to fit the new text
                      if (textWrapper) {
                        // Update wrapper width to fit the text
                        const textWidth = nextSpan.offsetWidth || nextSpan.scrollWidth
                        if (textWidth > 0) {
                          textWrapper.style.width = 'auto'
                          textWrapper.style.minWidth = `${textWidth}px`
                        }
                      }
                    }
                  }
                  
                  // Start rotation if loop is enabled or if we have more than one text
                  if (loop || textSpans.length > 1) {
                    (window as any)[`headlineInterval_${headlineId}`] = setInterval(() => {
                      rotateText()
                    }, iterationDelay)
                  }
                }
              }
            } catch (e) {
              console.warn('Failed to initialize animated headline:', e)
              // Still ensure visibility even if parsing fails
              widgetEl?.classList.remove('elementor-invisible')
              headlineEl.classList.remove('elementor-invisible')
              headlineEl.style.visibility = 'visible'
              headlineEl.style.opacity = '1'
            }
          }
        })
      }
      
      // Remove elementor-invisible class from footer elements so they show immediately
      if (containerRef.current) {
        const footer = containerRef.current.querySelector('footer')
        if (footer) {
          // Remove invisible class from all footer elements
          footer.querySelectorAll('.elementor-invisible').forEach((el) => {
            el.classList.remove('elementor-invisible')
            // Also ensure visibility
            const htmlEl = el as HTMLElement
            if (htmlEl.style) {
              htmlEl.style.visibility = 'visible'
              htmlEl.style.opacity = '1'
            }
          })
          
          // Also remove from footer sections
          footer.querySelectorAll('[class*="elementor-invisible"]').forEach((el) => {
            el.classList.remove('elementor-invisible')
            const htmlEl = el as HTMLElement
            if (htmlEl.style) {
              htmlEl.style.visibility = 'visible'
              htmlEl.style.opacity = '1'
            }
          })
        }
      }

      // Handle missing images - add placeholders for all missing images
      if (containerRef.current) {
          // Fix hover box background images - ensure they load properly
          containerRef.current.querySelectorAll('.bdt-ep-hover-box-img').forEach((img) => {
            const imgEl = img as HTMLElement
            const style = imgEl.getAttribute('style') || ''
            const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i)
            
            if (bgMatch && bgMatch[1]) {
              const bgUrl = bgMatch[1]
              // Fix URL if needed
              // IMPORTANT: Always convert rimalweb.net (any case) to alluredigital.net for asset filename lookup
              let fixedUrl = bgUrl
              if (bgUrl && (/alluredigital\.net/i.test(bgUrl) || /rimalweb\.net/i.test(bgUrl))) {
                // ALWAYS convert rimalweb.net (any case) to alluredigital.net - asset files use alluredigital.net
                let urlToFix = bgUrl
                if (/rimalweb\.net/i.test(bgUrl)) {
                  urlToFix = bgUrl.replace(/rimalweb\.net/gi, 'alluredigital.net')
                }
                fixedUrl = fixAssetUrl(urlToFix)
              }
              
              // Update style with fixed URL immediately
              if (fixedUrl !== bgUrl) {
                const newStyle = style.replace(bgUrl, fixedUrl)
                imgEl.setAttribute('style', newStyle)
                imgEl.style.backgroundImage = `url('${fixedUrl}')`
              } else {
                // Even if URL doesn't change, ensure background image is set
                imgEl.style.backgroundImage = `url('${fixedUrl}')`
              }
              
              // Remove any existing gradient fallback first
              let currentStyle = imgEl.getAttribute('style') || ''
              if (currentStyle.includes('linear-gradient')) {
                // Remove gradient and keep only background-image
                currentStyle = currentStyle.replace(/background:\s*linear-gradient[^;]+;/gi, '')
                currentStyle = currentStyle.replace(/background-color:\s*[^;]+;/gi, '')
                imgEl.setAttribute('style', currentStyle)
              }
              
              // Ensure visibility and proper sizing
              imgEl.style.opacity = '1'
              imgEl.style.visibility = 'visible'
              imgEl.style.display = 'block'
              imgEl.style.backgroundSize = 'cover'
              imgEl.style.backgroundPosition = 'center'
              imgEl.style.backgroundRepeat = 'no-repeat'
              imgEl.style.width = '100%'
              imgEl.style.height = '100%'
              imgEl.style.backgroundImage = `url('${fixedUrl}')`
              
              // Ensure parent content is visible if this is the first image
              const parentContent = imgEl.closest('.bdt-ep-hover-box-content') as HTMLElement
              if (parentContent && parentContent.classList.contains('bdt-active')) {
                parentContent.style.opacity = '1'
                parentContent.style.visibility = 'visible'
                parentContent.style.display = 'block'
                parentContent.style.zIndex = '10'
              }
              
              // Preload image to ensure it loads (don't set fallback gradient)
              const testImg = new Image()
              testImg.onload = function() {
                imgEl.style.backgroundImage = `url('${fixedUrl}')`
                imgEl.style.opacity = '1'
                imgEl.style.visibility = 'visible'
                imgEl.style.display = 'block'
                // Ensure no gradient is applied
                currentStyle = imgEl.getAttribute('style') || ''
                if (currentStyle.includes('linear-gradient')) {
                  currentStyle = currentStyle.replace(/background:\s*linear-gradient[^;]+;/gi, '')
                  currentStyle = currentStyle.replace(/background-color:\s*[^;]+;/gi, '')
                  imgEl.setAttribute('style', currentStyle)
                  imgEl.style.backgroundImage = `url('${fixedUrl}')`
                }
              }
              testImg.onerror = function() {
                console.warn('Hover box image failed to load:', fixedUrl)
                // Try alternative paths (without size suffix)
                const altUrl = fixedUrl.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1')
                if (altUrl !== fixedUrl) {
                  const altTestImg = new Image()
                  altTestImg.onload = function() {
                    imgEl.style.backgroundImage = `url('${altUrl}')`
                    imgEl.style.opacity = '1'
                    imgEl.style.visibility = 'visible'
                  }
                  altTestImg.src = altUrl
                }
              }
              testImg.src = fixedUrl
            }
          })
          
        // Helper function to create a nice placeholder SVG
        const createPlaceholderSvg = (width: number | string, height: number | string) => {
          const w = typeof width === 'string' ? parseInt(width) || 400 : width || 400
          const h = typeof height === 'string' ? parseInt(height) || 300 : height || 300
          return `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"%3E%3Crect width="100%25" height="100%25" fill="%23f5f5f5"/%3E%3Crect x="0" y="0" width="100%25" height="100%25" fill="url(%23gradient)"/%3E%3Cdefs%3E%3ClinearGradient id="gradient" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" style="stop-color:%23f0f0f0;stop-opacity:1" /%3E%3Cstop offset="100%25" style="stop-color:%23e0e0e0;stop-opacity:1" /%3E%3C/linearGradient%3E%3C/defs%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="Arial, sans-serif" font-size="16" fill="%23999"%3EImage%3C/text%3E%3C/svg%3E`
        }
        
        // Handle img tags - add error handlers for missing images
        containerRef.current.querySelectorAll('img[src]').forEach((img) => {
          const imgElement = img as HTMLImageElement
          let src = imgElement.getAttribute('src') || ''
          
          // Skip if already a placeholder
          if (src.includes('data:image/svg+xml')) return
          
          // IMPORTANT: Fix URL if it contains rimalweb.net (any case) - convert to alluredigital.net for asset lookup
          if (/rimalweb\.net/i.test(src)) {
            const fixedSrc = fixAssetUrl(src)
            // Update the src attribute if it was changed
            if (fixedSrc !== src) {
              imgElement.setAttribute('src', fixedSrc)
              src = fixedSrc
            }
          }
          
          // Add error handler for missing images
          imgElement.onerror = function() {
            // Only replace if it's a local asset that failed
            if ((src.includes('/assets/') || src.includes('alluredigital.net') || /rimalweb\.net/i.test(src)) && !src.includes('data:')) {
              // Get original dimensions
              const width = imgElement.getAttribute('width') || imgElement.offsetWidth || 400
              const height = imgElement.getAttribute('height') || imgElement.offsetHeight || 300
              
              // Create placeholder SVG
              const placeholderSvg = createPlaceholderSvg(width, height)
              
              // Prevent infinite loop
              imgElement.onerror = null
              imgElement.src = placeholderSvg
              imgElement.style.objectFit = 'contain'
              imgElement.style.backgroundColor = '#f5f5f5'
            }
          }
          
          // Pre-check image existence for local assets
          if ((src.includes('/assets/') || src.includes('alluredigital.net') || /rimalweb\.net/i.test(src)) && !src.includes('data:')) {
            const testImg = new Image()
            testImg.onerror = function() {
              const width = imgElement.getAttribute('width') || imgElement.offsetWidth || 400
              const height = imgElement.getAttribute('height') || imgElement.offsetHeight || 300
              const placeholderSvg = createPlaceholderSvg(width, height)
              imgElement.src = placeholderSvg
              imgElement.style.objectFit = 'contain'
              imgElement.style.backgroundColor = '#f5f5f5'
            }
            testImg.src = src
          }
        })
        
        // Handle background images - add fallback for missing background images
        containerRef.current.querySelectorAll('[style*="background-image"], .bdt-scroll-image').forEach((el) => {
          const element = el as HTMLElement
          
          // Welcome section - use original scraped HTML, don't modify it
          const isWelcomeSection = element.closest('section, div')?.querySelector('h2, h1')?.textContent?.includes('Welcome to') || 
                                   element.closest('section, div')?.querySelector('h2, h1')?.textContent?.includes('Breaking Through') ||
                                   element.closest('section, div')?.querySelector('h2, h1')?.textContent?.includes('Digital Impasse')
          
          // Skip modifying welcome section - use original scraped HTML
          if (isWelcomeSection && element.classList.contains('bdt-scroll-image')) {
            // Just fix URL if needed, but don't replace the image
            const style = element.getAttribute('style') || ''
            const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i)
            
            if (bgMatch && bgMatch[1]) {
              let bgUrl = bgMatch[1]
              
              // Fix URL if it contains rimalweb.net (any case) - convert to alluredigital.net for asset lookup
              if (/rimalweb\.net/i.test(bgUrl)) {
                const fixedBgUrl = fixAssetUrl(bgUrl)
                if (fixedBgUrl !== bgUrl) {
                  element.style.backgroundImage = `url('${fixedBgUrl}')`
                  bgUrl = fixedBgUrl
                }
              }
              
              // Preload image to ensure it loads
              if ((bgUrl.includes('/assets/') || bgUrl.includes('alluredigital.net') || /rimalweb\.net/i.test(bgUrl)) && !bgUrl.includes('data:')) {
                const testImg = new Image()
                testImg.onload = function() {
                  element.style.backgroundImage = `url('${bgUrl}')`
                }
                testImg.onerror = function() {
                  // Try without size suffix
                  const altUrl = bgUrl.replace(/-\d+x\d+/, '')
                  if (altUrl !== bgUrl) {
                    element.style.backgroundImage = `url('${altUrl}')`
                  }
                }
                testImg.src = bgUrl
              }
            }
            return // Skip the rest for this element
          }
          
          // For other background images, check if they exist
          // Skip hover box images - they are handled separately
          const isHoverBoxImage = element.classList.contains('bdt-ep-hover-box-img') || 
                                 element.closest('.bdt-ep-hover-box') !== null
          
          if (isHoverBoxImage) {
            return // Skip fallback for hover box images - they are handled above
          }
          
          const style = element.getAttribute('style') || ''
          const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i)
          
          if (bgMatch && bgMatch[1]) {
            let bgUrl = bgMatch[1]
            
            // IMPORTANT: Fix URL if it contains rimalweb.net (any case) - convert to alluredigital.net for asset lookup
            if (/rimalweb\.net/i.test(bgUrl)) {
              const fixedBgUrl = fixAssetUrl(bgUrl)
              // Update the style attribute if URL was changed
              if (fixedBgUrl !== bgUrl) {
                const updatedStyle = style.replace(/background-image:\s*url\(['"]?[^'")]+['"]?\)/i, `background-image: url('${fixedBgUrl}')`)
                element.setAttribute('style', updatedStyle)
                bgUrl = fixedBgUrl
              }
            }
            
            // Preload background image to check if it exists
            if ((bgUrl.includes('/assets/') || bgUrl.includes('alluredigital.net') || /rimalweb\.net/i.test(bgUrl)) && !bgUrl.includes('data:')) {
              const testImg = new Image()
              testImg.onerror = function() {
                // If image fails to load, set a fallback gradient background
                // BUT NOT for hover box images
                const currentStyle = element.getAttribute('style') || ''
                const fallbackStyle = currentStyle.replace(
                  /background-image:\s*url\([^)]+\)/gi,
                  'background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #f5f5f5 100%); background-color: #f5f5f5'
                )
                element.setAttribute('style', fallbackStyle)
              }
              testImg.src = bgUrl
            }
          }
        })
        
        // Also handle data-settings background slideshow images - ALLOW ORIGINAL SLIDESHOW
        // Find homepage hero section and ensure slideshow images load properly
        const homepageHeroSection = containerRef.current.querySelector('[data-settings*="background_slideshow_gallery"]')
        if (homepageHeroSection) {
          const heroEl = homepageHeroSection as HTMLElement
          // Ensure slideshow is visible and working
          const slideshow = heroEl.querySelector('.elementor-background-slideshow')
          if (slideshow) {
            // Keep slideshow visible - don't remove it
            const slideshowEl = slideshow as HTMLElement
            slideshowEl.style.display = 'block'
            slideshowEl.style.visibility = 'visible'
            slideshowEl.style.opacity = '1'
            
            // Try to enable loop on existing Swiper instance
            setTimeout(() => {
              const swiperInstance = (slideshowEl as any)?.swiper
              if (swiperInstance) {
                // ALWAYS enable loop for images (force loop) - destroy and recreate if needed
                if (!swiperInstance.params.loop || swiperInstance.params.loop === false) {
                  // Destroy existing loop if any
                  if (swiperInstance.loopDestroy) {
                    swiperInstance.loopDestroy()
                  }
                  
                  // Force enable loop
                  swiperInstance.params.loop = true
                  swiperInstance.params.loopedSlides = undefined // Let Swiper calculate automatically
                  swiperInstance.params.loopAdditionalSlides = 2
                  
                  // Create loop
                  if (swiperInstance.loopCreate) {
                    swiperInstance.loopCreate()
                  }
                  
                  // Update to apply changes
                  swiperInstance.update()
                  swiperInstance.updateSlides()
                  swiperInstance.updateSlidesClasses()
                } else {
                  // Even if loop is already enabled, ensure it's working properly
                  swiperInstance.params.loop = true
                  if (swiperInstance.loopCreate) {
                    swiperInstance.loopCreate()
                  }
                  swiperInstance.update()
                  swiperInstance.updateSlides()
                  swiperInstance.updateSlidesClasses()
                }
                
                // Set speed/transition to 0 for instant transition (no gap)
                swiperInstance.params.speed = 0
                
                // Ensure autoplay is running with seamless loop (no gap)
                if (swiperInstance.params.autoplay) {
                  swiperInstance.params.autoplay.disableOnInteraction = false
                  swiperInstance.params.autoplay.pauseOnMouseEnter = false
                  swiperInstance.params.autoplay.waitForTransition = false // Don't wait for transition
                }
                
                // Ensure slideshow is visible
                slideshowEl.style.display = 'block'
                slideshowEl.style.visibility = 'visible'
                slideshowEl.style.opacity = '1'
                
                // Ensure autoplay is running and will continue
                if (!swiperInstance.params.autoplay) {
                  swiperInstance.params.autoplay = {
                    delay: 5500,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: false,
                    waitForTransition: false,
                    stopOnLastSlide: false, // Don't stop on last slide
                    reverseDirection: false
                  }
                } else {
                  swiperInstance.params.autoplay.disableOnInteraction = false
                  swiperInstance.params.autoplay.pauseOnMouseEnter = false
                  swiperInstance.params.autoplay.waitForTransition = false
                  swiperInstance.params.autoplay.stopOnLastSlide = false // Don't stop on last slide
                }
                
                if (!swiperInstance.autoplay || !swiperInstance.autoplay.running) {
                  if (swiperInstance.autoplay) {
                    swiperInstance.autoplay.start()
                  }
                } else {
                  // Restart autoplay to ensure seamless loop
                  swiperInstance.autoplay.stop()
                  setTimeout(() => {
                    swiperInstance.autoplay.start()
                  }, 100)
                }
                
                // Force update to apply all changes
                swiperInstance.update()
                swiperInstance.updateSlides()
                swiperInstance.updateSlidesClasses()
                
                // Monitor and restart autoplay if it stops
                const checkAutoplay = setInterval(() => {
                  if (swiperInstance && swiperInstance.autoplay && !swiperInstance.autoplay.running) {
                    swiperInstance.autoplay.start()
                  }
                  // Ensure slideshow is still visible
                  slideshowEl.style.display = 'block'
                  slideshowEl.style.visibility = 'visible'
                  slideshowEl.style.opacity = '1'
                }, 1000)
                
                // Store interval reference for cleanup
                const heroSlideshowId = heroEl.getAttribute('data-id') || 'hero-default'
                ;(window as any)[`autoplayMonitor_${heroSlideshowId}`] = checkAutoplay
              }
            }, 1000)
          }
          
          // Ensure hero section has proper height
          heroEl.style.setProperty('min-height', '500px', 'important')
        }
        
        containerRef.current.querySelectorAll('[data-settings]').forEach((el) => {
          const settings = el.getAttribute('data-settings')
          if (settings && (settings.includes('background_slideshow_gallery') || settings.includes('background_image'))) {
            try {
              // Decode HTML entities properly
              const decoded = settings
                .replace(/&amp;/g, '&')  // Must decode &amp; first
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'")
              
              const parsed = JSON.parse(decoded)
              
              // Handle hero section background images - ensure they display properly
              const element = el as HTMLElement
              
              // Handle classic background images
              if (parsed.background_background === 'classic' && parsed.background_image && parsed.background_image.url) {
                const bgUrl = fixAssetUrl(parsed.background_image.url)
                
                // Force background image to display immediately
                element.style.backgroundImage = `url('${bgUrl}')`
                element.style.backgroundSize = 'cover'
                element.style.backgroundPosition = 'center'
                element.style.backgroundRepeat = 'no-repeat'
                element.style.minHeight = '500px' // Ensure section has height
                
                // Preload and verify image loads
                const testImg = new Image()
                testImg.onload = function() {
                  element.style.backgroundImage = `url('${bgUrl}')`
                  element.style.opacity = '1'
                }
                testImg.onerror = function() {
                  console.warn('Background image failed to load:', bgUrl)
                  // Try alternative image paths
                  const altUrl = bgUrl.replace(/-\d+x\d+/, '') // Remove size suffix
                  if (altUrl !== bgUrl) {
                    element.style.backgroundImage = `url('${altUrl}')`
                  }
                }
                testImg.src = bgUrl
              }
              
              // Handle slideshow background images - ALLOW ORIGINAL SLIDESHOW TO WORK
              if (parsed.background_background === 'slideshow' && parsed.background_slideshow_gallery && Array.isArray(parsed.background_slideshow_gallery) && parsed.background_slideshow_gallery.length > 0) {
                // Ensure slideshow element is visible
                const slideshowEl = element.querySelector('.elementor-background-slideshow') as HTMLElement
                if (slideshowEl) {
                  slideshowEl.style.display = 'block'
                  slideshowEl.style.visibility = 'visible'
                  slideshowEl.style.opacity = '1'
                }
                
                // Ensure section has proper height
                element.style.minHeight = '500px'
                
                // Initialize or reinitialize Swiper with loop and autoplay
                const slideDuration = parsed.background_slideshow_slide_duration || 5500
                // Set transition duration to 0 for no time gap between slides
                const transitionDuration = 0
                // Always enable loop for images
                const shouldLoop = true
                
                // Use setTimeout to ensure Swiper is initialized after DOM is ready
                setTimeout(() => {
                  // Check if Swiper is already initialized on this element
                  const swiperElement = slideshowEl as any
                  
                  // If Swiper exists, update its settings
                  if (swiperElement && swiperElement.swiper) {
                    const swiper = swiperElement.swiper
                    
                    // ALWAYS enable loop for images (force loop) - destroy and recreate if needed
                    if (!swiper.params.loop || swiper.params.loop === false) {
                      // Destroy existing loop if any
                      if (swiper.loopDestroy) {
                        swiper.loopDestroy()
                      }
                      
                      // Force enable loop
                      swiper.params.loop = true
                      swiper.params.loopedSlides = undefined // Let Swiper calculate automatically
                      swiper.params.loopAdditionalSlides = 2
                      
                      // Create loop
                      if (swiper.loopCreate) {
                        swiper.loopCreate()
                      }
                      
                      // Update to apply changes
                      swiper.update()
                      swiper.updateSlides()
                      swiper.updateSlidesClasses()
                    } else {
                      // Even if loop is already enabled, ensure it's working properly
                      swiper.params.loop = true
                      if (swiper.loopCreate) {
                        swiper.loopCreate()
                      }
                      swiper.update()
                      swiper.updateSlides()
                      swiper.updateSlidesClasses()
                    }
                    
                    // Set speed/transition to 0 for instant transition (no gap)
                    swiper.params.speed = 0
                    swiper.params.slideToClickedSlide = false
                    
                    // Ensure slideshow is visible
                    if (slideshowEl) {
                      slideshowEl.style.display = 'block'
                      slideshowEl.style.visibility = 'visible'
                      slideshowEl.style.opacity = '1'
                    }
                    
                    // Enable autoplay with seamless loop (no gap between cycles) - ensure it never stops
                    if (!swiper.params.autoplay) {
                      swiper.params.autoplay = {
                        delay: slideDuration,
                        disableOnInteraction: false,
                        pauseOnMouseEnter: false,
                        waitForTransition: false,
                        stopOnLastSlide: false, // Don't stop on last slide - critical for continuous loop
                        reverseDirection: false
                      }
                    } else {
                      // Update existing autoplay settings - ensure it never stops
                      swiper.params.autoplay.delay = slideDuration
                      swiper.params.autoplay.disableOnInteraction = false
                      swiper.params.autoplay.pauseOnMouseEnter = false
                      swiper.params.autoplay.waitForTransition = false
                      swiper.params.autoplay.stopOnLastSlide = false // Don't stop on last slide - critical for continuous loop
                    }
                    
                    // Start autoplay if not running
                    if (!swiper.autoplay.running) {
                      swiper.autoplay.start()
                    } else {
                      // Restart autoplay to apply new settings
                      swiper.autoplay.stop()
                      setTimeout(() => {
                        swiper.autoplay.start()
                      }, 100)
                    }
                    
                    // Force update to apply all changes
                    swiper.update()
                    swiper.updateSlides()
                    swiper.updateSlidesClasses()
                    
                    // Monitor and restart autoplay if it stops
                    const checkAutoplay = setInterval(() => {
                      if (swiper && swiper.autoplay && !swiper.autoplay.running) {
                        swiper.autoplay.start()
                      }
                      // Ensure slideshow is still visible
                      if (slideshowEl) {
                        slideshowEl.style.display = 'block'
                        slideshowEl.style.visibility = 'visible'
                        slideshowEl.style.opacity = '1'
                      }
                    }, 1000)
                    
                    // Store interval reference for cleanup
                    const slideshowId = element.getAttribute('data-id') || 'default'
                    ;(window as any)[`autoplayMonitor_${slideshowId}`] = checkAutoplay
                  } else {
                    // Manual slideshow rotation if Swiper is not available
                    const slides = element.querySelectorAll('.elementor-background-slideshow__slide:not(.swiper-slide-duplicate)') as NodeListOf<HTMLElement>
                    
                    // Get only actual slides (not duplicates)
                    const actualSlides: HTMLElement[] = []
                    slides.forEach((slide) => {
                      if (!slide.classList.contains('swiper-slide-duplicate')) {
                        actualSlides.push(slide)
                      }
                    })
                    
                    if (actualSlides.length > 1) {
                      let currentSlideIndex = 0
                      
                      const showSlide = (index: number) => {
                        const actualIndex = index % actualSlides.length
                        actualSlides.forEach((slide, idx) => {
                          if (idx === actualIndex) {
                            // No transition for instant change (0ms gap)
                            slide.style.transition = 'opacity 0ms ease'
                            slide.style.opacity = '1'
                            slide.style.visibility = 'visible'
                            slide.style.zIndex = '2'
                            slide.style.display = 'block'
                          } else {
                            // No transition for instant change (0ms gap)
                            slide.style.transition = 'opacity 0ms ease'
                            slide.style.opacity = '0'
                            slide.style.visibility = 'hidden'
                            slide.style.zIndex = '0'
                            slide.style.display = 'block'
                          }
                        })
                      }
                      
                      // Show first slide
                      showSlide(0)
                      
                      // Always enable loop for images - FIXED: Use proper transition duration
                      const transitionDurationActual = parsed.background_slideshow_transition_duration || 1800
                      
                      // Update showSlide function to use proper transition for smooth fade
                      const showSlideWithTransition = (index: number) => {
                        const actualIndex = index % actualSlides.length
                        actualSlides.forEach((slide, idx) => {
                          if (idx === actualIndex) {
                            slide.style.transition = `opacity ${transitionDurationActual}ms ease`
                            slide.style.opacity = '1'
                            slide.style.visibility = 'visible'
                            slide.style.zIndex = '2'
                            slide.style.display = 'block'
                          } else {
                            slide.style.transition = `opacity ${transitionDurationActual}ms ease`
                            slide.style.opacity = '0'
                            slide.style.visibility = 'hidden'
                            slide.style.zIndex = '0'
                            slide.style.display = 'block'
                          }
                        })
                      }
                      
                      // Clear any existing interval for this slideshow
                      const slideshowId = element.getAttribute('data-id') || 'default'
                      if ((window as any)[`slideshowInterval_${slideshowId}`]) {
                        clearInterval((window as any)[`slideshowInterval_${slideshowId}`])
                      }
                      
                      // Start new interval with proper loop - ensure continuous rotation
                      if (typeof console !== 'undefined' && console.log) {
                        console.log(`Starting hero slideshow loop: ${actualSlides.length} slides, ${slideDuration}ms delay, ${transitionDurationActual}ms transition`)
                      }
                      
                      (window as any)[`slideshowInterval_${slideshowId}`] = setInterval(() => {
                        currentSlideIndex = (currentSlideIndex + 1) % actualSlides.length
                        showSlideWithTransition(currentSlideIndex)
                      }, slideDuration) // Use slideDuration - loop will continue indefinitely
                      
                      if (typeof console !== 'undefined' && console.log) {
                        console.log(`Hero slideshow manual rotation ACTIVE - will loop continuously`)
                      }
                    } else {
                      console.warn('Hero slideshow: Not enough slides found for loop', actualSlides.length)
                    }
                  }
                }, 1500) // Increased timeout to ensure DOM is ready and Swiper initialized
                  
                // Preload all slideshow images to ensure they load properly
                  parsed.background_slideshow_gallery.forEach((item: any, index: number) => {
                    if (item && item.url) {
                      const imageUrl = fixAssetUrl(item.url)
                    
                    // Preload image
                      const testImg = new Image()
                      testImg.onload = function() {
                      // Image loaded successfully
                      // Update slideshow slide images directly
                      const slides = element.querySelectorAll('.elementor-background-slideshow__slide__image')
                      slides.forEach((slide, slideIndex) => {
                        const slideEl = slide as HTMLElement
                        const slideStyle = slideEl.getAttribute('style') || ''
                        // If this slide contains this image URL, ensure it's fixed
                        if (slideStyle.includes(imageUrl) || slideStyle.includes(item.url)) {
                          // Fix URL in slide if needed
                          if (slideStyle.includes(item.url) && !slideStyle.includes(imageUrl)) {
                            slideEl.style.backgroundImage = `url('${imageUrl}')`
                        }
                        }
                      })
                      }
                      testImg.onerror = function() {
                        console.warn('Slideshow image failed to load:', imageUrl)
                      // Try alternative path without size suffix
                        const altUrl = imageUrl.replace(/-\d+x\d+/, '')
                        if (altUrl !== imageUrl) {
                          testImg.src = altUrl
                        }
                      }
                      testImg.src = imageUrl
                    }
                  })
              }
            } catch (e) {
              console.warn('Failed to parse data-settings for background:', e)
            }
          }
        })
        
        // Fix slideshow slide images directly (they have inline styles)
        // Don't hide duplicate slides - they are needed for loop to work
        containerRef.current.querySelectorAll('.elementor-background-slideshow__slide, .swiper-slide').forEach((slide) => {
          const slideEl = slide as HTMLElement
          
          // Only show active/visible slides - hide all others
          // Keep duplicate slides visible (with opacity 0) for loop to work
          if (slideEl.classList.contains('swiper-slide-active') || slideEl.classList.contains('swiper-slide-visible')) {
            slideEl.style.opacity = '1'
            slideEl.style.visibility = 'visible'
            slideEl.style.zIndex = '1'
            slideEl.style.display = 'block'
          } else if (slideEl.classList.contains('swiper-slide-duplicate')) {
            // Keep duplicate slides but hidden - needed for seamless loop
            slideEl.style.opacity = '0'
            slideEl.style.visibility = 'hidden'
            slideEl.style.display = 'block' // Keep display: block for loop
          } else {
            // Hide inactive slides
            slideEl.style.opacity = '0'
            slideEl.style.visibility = 'hidden'
            slideEl.style.display = 'block' // Keep display: block
          }
          
          // Fix image URL in slide
          const slideImage = slideEl.querySelector('.elementor-background-slideshow__slide__image') as HTMLElement
          if (slideImage) {
            const bgImage = slideImage.style.backgroundImage || slideImage.getAttribute('style') || ''
          
          if (bgImage && bgImage.includes('alluredigital.net')) {
            // Extract URL from style
            const urlMatch = bgImage.match(/url\(['"]?([^'")]+)['"]?\)/)
            if (urlMatch && urlMatch[1]) {
              const fixedUrl = fixAssetUrl(urlMatch[1])
                slideImage.style.backgroundImage = `url('${fixedUrl}')`
                slideImage.style.backgroundSize = 'cover'
                slideImage.style.backgroundPosition = 'center'
              
              // Preload image
              const testImg = new Image()
              testImg.onload = function() {
                  slideImage.style.backgroundImage = `url('${fixedUrl}')`
              }
              testImg.onerror = function() {
                // Try without size suffix
                const altUrl = fixedUrl.replace(/-\d+x\d+/, '')
                if (altUrl !== fixedUrl) {
                    slideImage.style.backgroundImage = `url('${altUrl}')`
                }
              }
              testImg.src = fixedUrl
              }
            }
          }
        })
        
        // Also check for hero section by class/id and force background images
        containerRef.current.querySelectorAll('.elementor-section, section').forEach((section) => {
          const sectionEl = section as HTMLElement
          const computedStyle = window.getComputedStyle(sectionEl)
          const bgImage = computedStyle.backgroundImage
          
          // If section has a background image URL that needs fixing
          if (bgImage && bgImage !== 'none' && bgImage.includes('alluredigital.net')) {
            const urlMatch = bgImage.match(/url\(['"]?([^'")]+)['"]?\)/)
            if (urlMatch && urlMatch[1]) {
              const fixedUrl = fixAssetUrl(urlMatch[1])
              sectionEl.style.backgroundImage = `url('${fixedUrl}')`
              sectionEl.style.backgroundSize = 'cover'
              sectionEl.style.backgroundPosition = 'center'
            }
          }
        })
      }

      // Now load scripts AFTER body is set (preserve order)
      const allScripts = doc.querySelectorAll('script')
      const scriptPromises: Promise<void>[] = []

      allScripts.forEach((script) => {
        if (script.src) {
          const src = script.getAttribute('src') || ''
          const scriptId = src
          
          // Skip external APIs - only load local assets
          if (src.includes('maps.googleapis.com') || 
              src.includes('googleapis.com') || 
              src.includes('gstatic.com') ||
              src.includes('googletagmanager.com') ||
              src.includes('google-analytics.com') ||
              src.includes('facebook.net') ||
              src.includes('clarity.ms') ||
              src.includes('cleantalk.org') ||
              src.includes('pearldiver.io') ||
              src.includes('usbrowserspeed.com') ||
              src.includes('recaptcha')) {
            // Skip external APIs
            return
          }
          
          if (!scriptsLoadedRef.current.has(scriptId)) {
            const newScript = document.createElement('script')
            
            // Only load local assets
            if (src.includes('alluredigital.net') || src.startsWith('http')) {
              const filename = getAssetFilename(src)
              if (filename) {
                newScript.src = `/assets/${filename}`
              } else {
                // Skip if can't find local asset
                return
              }
            } else {
              newScript.src = src
            }
            
            // Copy ALL attributes
            Array.from(script.attributes).forEach((attr) => {
              if (attr.name !== 'src') {
                newScript.setAttribute(attr.name, attr.value)
              }
            })
            
            // Handle async/defer
            if (script.hasAttribute('async')) newScript.async = true
            if (script.hasAttribute('defer')) newScript.defer = true
            
            const loadPromise = new Promise<void>((resolve) => {
              newScript.onload = () => resolve()
              newScript.onerror = () => resolve() // Continue even if script fails
              document.head.appendChild(newScript)
            })
            
            scriptPromises.push(loadPromise)
            scriptsLoadedRef.current.add(scriptId)
          }
        } else if (script.textContent) {
          // Skip inline scripts that reference external APIs
          const scriptText = script.textContent
          if (scriptText.includes('gtag') || 
              scriptText.includes('fbq') || 
              scriptText.includes('clarity') ||
              scriptText.includes('dataLayer') ||
              scriptText.includes('google') ||
              scriptText.includes('maps') ||
              scriptText.includes('recaptcha')) {
            // Skip analytics/tracking scripts
            return
          }
          
          // Inline scripts - execute after DOM is ready
          const scriptId = scriptText.substring(0, 50)
          if (!scriptsLoadedRef.current.has(scriptId)) {
            const newScript = document.createElement('script')
            newScript.textContent = scriptText
            // Copy attributes
            Array.from(script.attributes).forEach((attr) => {
              newScript.setAttribute(attr.name, attr.value)
            })
            document.head.appendChild(newScript)
            scriptsLoadedRef.current.add(scriptId)
          }
        }
      })

      // Wait for CSS to load first (critical), then scripts, then show content
      // CSS must be fully loaded before showing content to prevent broken layout
      if (stylePromises.length > 0) {
        // Wait for ALL CSS to load first
        Promise.all(stylePromises).then(() => {
          // Force a reflow to ensure CSS is applied
          if (containerRef.current) {
            containerRef.current.offsetHeight // Trigger reflow
          }
          
          // Wait for CSS to be fully applied to DOM
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Now load scripts in background (non-blocking)
              if (scriptPromises.length > 0) {
                Promise.all(scriptPromises).then(() => {
                  // Trigger DOMContentLoaded for scripts that depend on it
                  if (document.readyState === 'loading') {
                    document.dispatchEvent(new Event('DOMContentLoaded'))
                  }
                  
                  // Trigger jQuery ready if jQuery is loaded
                  if (typeof window !== 'undefined' && (window as any).jQuery) {
                    (window as any).jQuery(document).ready(() => {
                      // Elementor and other scripts will initialize
                      
                      // Initialize BDT Offcanvas menu if available
                      if ((window as any).UIkit) {
                        // UIkit is loaded, offcanvas should work automatically
                        // But ensure it's properly initialized
                        setTimeout(() => {
                          if (containerRef.current) {
                            const offcanvasButtons = containerRef.current.querySelectorAll('[data-bdt-toggle="target"]')
                            offcanvasButtons.forEach((btn) => {
                              // Ensure click handler works
                              btn.addEventListener('click', (e) => {
                                e.preventDefault()
                                const targetId = btn.getAttribute('data-bdt-toggle')?.replace('target: ', '')
                                if (targetId) {
                                  const target = document.querySelector(targetId)
                                  if (target && (window as any).UIkit) {
                                    const offcanvas = (window as any).UIkit.offcanvas(target)
                                    if (offcanvas) {
                                      offcanvas.show()
                                    }
                                  }
                                }
                    })
                            })
                          }
                        }, 500)
                      }
                    })
                  }
                  
                  // Also initialize offcanvas after a delay to ensure scripts are loaded
                  setTimeout(() => {
                    if (containerRef.current) {
                      // Remove all Facebook and Instagram links globally
                      const allLinks = containerRef.current.querySelectorAll('a[href]')
                      allLinks.forEach((link) => {
                        const href = link.getAttribute('href') || ''
                        if (href.includes('facebook.com') || href.includes('fb.com') || href.includes('instagram.com') ||
                            href.includes('facebook.net') || href.toLowerCase().includes('facebook') || 
                            href.toLowerCase().includes('instagram')) {
                          link.removeAttribute('href')
                          const linkEl = link as HTMLElement
                          linkEl.style.pointerEvents = 'none'
                          linkEl.style.cursor = 'default'
                          linkEl.style.textDecoration = 'none'
                          linkEl.style.display = 'none'
                          linkEl.style.visibility = 'hidden'
                          linkEl.style.opacity = '0'
                        }
                      })
                      
                      // Hide offcanvas menu by default - only show when button is clicked
                      const offcanvasMenus = containerRef.current.querySelectorAll('.bdt-offcanvas')
                      offcanvasMenus.forEach((menu) => {
                        const menuEl = menu as HTMLElement
                        // Hide menu by default to prevent white screen, ensure right side positioning
                        menuEl.style.display = 'none'
                        menuEl.style.visibility = 'hidden'
                        menuEl.style.opacity = '0'
                        menuEl.style.transform = 'translateX(100%)'
                        menuEl.style.right = '0'
                        menuEl.style.left = 'auto'
                        menuEl.classList.remove('bdt-open')
                      })
                      
                      // Fix offcanvas button click handlers - WORK ON FIRST CLICK
                      const offcanvasButtons = containerRef.current.querySelectorAll('.bdt-offcanvas-button, [data-bdt-toggle*="offcanvas"], [data-bdt-toggle*="target"]')
                      offcanvasButtons.forEach((btn) => {
                        // Remove any existing listeners to prevent double-click issue
                        const newBtn = btn.cloneNode(true) as HTMLElement
                        btn.parentNode?.replaceChild(newBtn, btn)
                        
                        newBtn.addEventListener('click', function(e) {
                          e.preventDefault()
                          e.stopPropagation()
                          
                          const targetAttr = this.getAttribute('data-bdt-toggle')
                          let targetId = ''
                          
                          if (targetAttr) {
                            // Handle different formats: "target: #id" or "#id" or "offcanvas: #id"
                            if (targetAttr.includes('target:')) {
                              targetId = targetAttr.replace(/target:\s*/i, '').trim()
                            } else if (targetAttr.includes('offcanvas:')) {
                              targetId = targetAttr.replace(/offcanvas:\s*/i, '').trim()
                            } else if (targetAttr.startsWith('#')) {
                              targetId = targetAttr
                            }
                          }
                          
                          // Also check href if target not found
                          if (!targetId && (this as any).href) {
                            const href = (this as any).href
                            const hashMatch = href.match(/#[^\s]+/)
                            if (hashMatch) {
                              targetId = hashMatch[0]
                            }
                          }
                          
                          if (targetId) {
                            const target = document.querySelector(targetId) as HTMLElement
                            if (target) {
                              const isOpen = target.classList.contains('bdt-open') || target.style.display === 'block'
                              
                              if (isOpen) {
                                // Close menu - remove black overlay, reset positioning
                                target.classList.remove('bdt-open')
                                target.style.transform = 'translateX(100%)'
                                target.setAttribute('aria-hidden', 'true')
                                // Wait for transition, then fully hide
                                setTimeout(() => {
                                  target.style.display = 'none'
                                  target.style.visibility = 'hidden'
                                  target.style.opacity = '0'
                                  target.style.right = '0'
                                  target.style.left = 'auto'
                                }, 300)
                                document.body.classList.remove('bdt-offcanvas-page')
                                document.body.style.overflow = ''
                                document.body.style.backgroundColor = ''
                                // Remove any white overlay/backdrop
                                const overlays = document.querySelectorAll('.bdt-offcanvas-backdrop, .offcanvas-backdrop, [class*="overlay"], [class*="backdrop"]')
                                overlays.forEach((overlay) => {
                                  const el = overlay as HTMLElement
                                  el.style.display = 'none'
                                  el.style.visibility = 'hidden'
                                  el.style.opacity = '0'
                                  el.remove()
                                })
                              } else {
                                // Open menu on FIRST CLICK - no black overlay, ensure right side position
                                target.classList.add('bdt-open')
                                target.style.display = 'block'
                                target.style.visibility = 'visible'
                                target.style.opacity = '1'
                                target.style.transform = 'translateX(0)'
                                target.style.right = '0'
                                target.style.left = 'auto'
                                target.setAttribute('aria-hidden', 'false')
                                document.body.style.overflow = 'hidden'
                                // DO NOT add bdt-offcanvas-page class (it causes black overlay)
                                document.body.classList.remove('bdt-offcanvas-page')
                                document.body.style.backgroundColor = 'transparent'
                              }
                            }
                          }
                        })
                      })
                      
                      // Fix offcanvas close button handlers - handle all possible close buttons
                      const closeButtonSelectors = [
                        '.bdt-offcanvas-close',
                        '[data-bdt-close]',
                        '[data-close]',
                        '.offcanvas-close',
                        '.close-button'
                      ]
                      
                      // Handle standard close button selectors
                      closeButtonSelectors.forEach((selector) => {
                        const closeButtons = containerRef.current.querySelectorAll(selector)
                        closeButtons.forEach((btn) => {
                          // Remove any existing listeners
                          const newBtn = btn.cloneNode(true) as HTMLElement
                          btn.parentNode?.replaceChild(newBtn, btn)
                          
                          newBtn.addEventListener('click', function(e) {
                            e.preventDefault()
                            e.stopPropagation()
                            
                            // Find the offcanvas menu
                            const offcanvas = this.closest('.bdt-offcanvas') || document.querySelector('.bdt-offcanvas.bdt-open') || 
                                            document.querySelector('.bdt-offcanvas[aria-hidden="false"]')
                            
                            if (offcanvas) {
                              const menuEl = offcanvas as HTMLElement
                              menuEl.classList.remove('bdt-open')
                              menuEl.style.transform = 'translateX(100%)'
                              menuEl.setAttribute('aria-hidden', 'true')
                              // Wait for transition, then fully hide
                              setTimeout(() => {
                                menuEl.style.display = 'none'
                                menuEl.style.visibility = 'hidden'
                                menuEl.style.opacity = '0'
                                menuEl.style.right = '0'
                                menuEl.style.left = 'auto'
                              }, 300)
                              document.body.classList.remove('bdt-offcanvas-page')
                              document.body.style.overflow = ''
                              document.body.style.backgroundColor = ''
                              // Remove any white overlay/backdrop
                              const overlays = document.querySelectorAll('.bdt-offcanvas-backdrop, .offcanvas-backdrop, [class*="overlay"], [class*="backdrop"]')
                              overlays.forEach((overlay) => {
                                const el = overlay as HTMLElement
                                el.style.display = 'none'
                                el.style.visibility = 'hidden'
                                el.style.opacity = '0'
                                el.remove()
                              })
                            }
                          })
                        })
                      })
                      
                      // Also handle any buttons inside offcanvas that look like close buttons
                      offcanvasMenus.forEach((offcanvas) => {
                        const buttons = offcanvas.querySelectorAll('button, a, [role="button"]')
                        buttons.forEach((btn) => {
                          const btnEl = btn as HTMLElement
                          const btnText = btnEl.textContent || ''
                          const btnHtml = btnEl.innerHTML || ''
                          const ariaLabel = btnEl.getAttribute('aria-label') || ''
                          const className = btnEl.className || ''
                          
                          // Check if this looks like a close button
                          const isCloseButton = 
                            btnText.includes('×') || btnText.includes('✕') || btnText.includes('✖') ||
                            btnHtml.includes('×') || btnHtml.includes('&times;') || btnHtml.includes('✕') || btnHtml.includes('✖') ||
                            ariaLabel.toLowerCase().includes('close') ||
                            className.toLowerCase().includes('close') ||
                            btnEl.querySelector('svg') !== null ||
                            btnEl.querySelector('.elementor-icon') !== null
                          
                          if (isCloseButton && !closeButtonSelectors.some(sel => btnEl.matches(sel))) {
                            // Remove any existing listeners
                            const newBtn = btn.cloneNode(true) as HTMLElement
                            btn.parentNode?.replaceChild(newBtn, btn)
                            
                            newBtn.addEventListener('click', function(e) {
                              e.preventDefault()
                              e.stopPropagation()
                              
                              const menuEl = offcanvas as HTMLElement
                              menuEl.classList.remove('bdt-open')
                              menuEl.style.transform = 'translateX(100%)'
                              menuEl.setAttribute('aria-hidden', 'true')
                              // Wait for transition, then fully hide
                              setTimeout(() => {
                                menuEl.style.display = 'none'
                                menuEl.style.visibility = 'hidden'
                                menuEl.style.opacity = '0'
                                menuEl.style.right = '0'
                                menuEl.style.left = 'auto'
                              }, 300)
                              document.body.classList.remove('bdt-offcanvas-page')
                              document.body.style.overflow = ''
                              document.body.style.backgroundColor = ''
                              // Remove any white overlay/backdrop
                              const overlays = document.querySelectorAll('.bdt-offcanvas-backdrop, .offcanvas-backdrop, [class*="overlay"], [class*="backdrop"]')
                              overlays.forEach((overlay) => {
                                const el = overlay as HTMLElement
                                el.style.display = 'none'
                                el.style.visibility = 'hidden'
                                el.style.opacity = '0'
                                el.remove()
                              })
                            })
                          }
                        })
                      })
                    }
                  }, 1000)
                }).catch(() => {
                  // Scripts failed but continue
                })
              }
              
              // Show content after CSS is loaded and applied
              setTimeout(() => {
                setIsLoading(false)
              }, 150)
            })
          })
        }).catch(() => {
          // Even if CSS fails, wait a bit then show content
          setTimeout(() => {
            setIsLoading(false)
          }, 300)
        })
      } else if (scriptPromises.length > 0) {
        // No CSS but has scripts
        Promise.all(scriptPromises).then(() => {
          setTimeout(() => {
            setIsLoading(false)
          }, 100)
        }).catch(() => {
          setTimeout(() => {
            setIsLoading(false)
          }, 200)
        })
      } else {
        // No assets to load, wait a bit for initial render
        setTimeout(() => {
          setIsLoading(false)
        }, 200)
      }
    }
    
    // Cleanup function for useEffect
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [html])

  return (
    <>
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            border: '5px solid rgba(255, 255, 255, 0.3)',
            borderTop: '5px solid #ffffff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '30px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
          }} />
          <div style={{
            color: '#ffffff',
            fontSize: '24px',
            fontWeight: 600,
            marginBottom: '10px',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)'
          }}>
            Rimalweb
          </div>
          <div style={{
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '16px',
            fontWeight: 400
          }}>
            Loading...
          </div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
      <div 
        ref={containerRef} 
        style={{
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 0.3s ease-in-out'
        }}
      />
    </>
  )
}

