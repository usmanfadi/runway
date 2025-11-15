'use client'

import { useEffect, useRef, useState } from 'react'

interface PageRendererProps {
  html: string
}

// Helper to extract filename from URL (handles query params)
function getAssetFilename(url: string): string | null {
  try {
    const urlObj = new URL(url, 'https://alluredigital.net')
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

  useEffect(() => {
    if (!containerRef.current || !html) return
    
    setIsLoading(true)

    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Extract and inject head content FIRST (before body)
    const head = doc.querySelector('head')
    const stylePromises: Promise<void>[] = []
    
    if (head) {
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
        // Logo
        allAssets.push({ href: '/rimal.png', as: 'image' })
        
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
      const fixAssetUrl = (url: string): string => {
        if (!url || url.startsWith('data:') || url.startsWith('/assets/')) return url
        if (url.includes('alluredigital.net') || url.startsWith('http')) {
          const filename = getAssetFilename(url)
          if (filename) {
            // WordPress adds size suffixes like -2048x903, -300x200, etc. to image URLs
            // but the actual files don't have these suffixes. Strip them from filename.
            const filenameWithoutSize = filename.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1')
            return `/assets/${filenameWithoutSize}`
          }
        }
        // Handle Rimalweb.net URLs - fallback to alluredigital.net filename
        if (url.includes('rimalweb.net') || url.includes('Rimalweb.net')) {
          // Replace rimalweb.net with alluredigital.net in URL to get correct filename
          const originalUrl = url.replace(/rimalweb\.net/gi, 'alluredigital.net')
          const filename = getAssetFilename(originalUrl)
          if (filename) {
            // Strip WordPress size suffixes
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
          
          // Replace logo images with Rimalweb logo from public folder
          if (isLogoImage && (isInHeader || isInFooter || hasLogoClass)) {
            const parent = img.parentElement
            if (parent) {
              const imgElement = img as HTMLImageElement
              const originalWidth = parseInt(img.getAttribute('width') || (imgElement.offsetWidth ? imgElement.offsetWidth.toString() : '200'))
              const originalHeight = parseInt(img.getAttribute('height') || (imgElement.offsetHeight ? imgElement.offsetHeight.toString() : '50'))
              
              // Increase size by 20% for header/footer logos
              const width = Math.round(originalWidth * 1.2)
              const height = Math.round(originalHeight * 1.2)
              
              const classes = img.getAttribute('class') || ''
              const style = img.getAttribute('style') || ''
              const alt = img.getAttribute('alt') || 'Rimalweb'
              
              // Create new image element with Rimalweb logo (bigger size)
              const newLogo = document.createElement('img')
              newLogo.src = '/rimal.png'
              newLogo.setAttribute('width', width.toString())
              newLogo.setAttribute('height', height.toString())
              newLogo.setAttribute('alt', alt)
              newLogo.setAttribute('class', classes)
              
              // Make footer logo transparent
              const opacityStyle = isInFooter ? 'opacity: 0.5; ' : ''
              // Move header logo up a bit
              const headerPositionStyle = isInHeader ? 'margin-top: -10px; ' : ''
              // Add style to make it bigger while preserving original
              newLogo.setAttribute('style', `width: ${width}px; height: ${height}px; object-fit: contain; ${opacityStyle}${headerPositionStyle}${style}`)
              
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
        
        // Also replace in href attributes (tel: and mailto: links) and remove Google Maps links
        tempDiv.querySelectorAll('a[href]').forEach((a) => {
          const href = a.getAttribute('href') || ''
          
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
              const urlToFix = domain === 'rimalweb' 
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
              // Fix URLs in string values
              return obj.replace(/https?:\/\/([^"\/]+\.)?(alluredigital|rimalweb)\.net([^"]*)/gi, (urlMatch, subdomain, domain, path) => {
                const urlToFix = domain === 'rimalweb' 
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
          
          // Replace home page hero slideshow with About Us banner image
          if (parsed.background_background === 'slideshow' && parsed.background_slideshow_gallery && Array.isArray(parsed.background_slideshow_gallery)) {
            // Replace slideshow gallery with single about-banner image
            parsed.background_slideshow_gallery = [{
              id: 393,
              url: 'https://alluredigital.net/wp-content/uploads/2022/12/about-banner.png'
            }]
            // Change to classic background instead of slideshow
            parsed.background_background = 'classic'
            parsed.background_image = {
              url: 'https://alluredigital.net/wp-content/uploads/2022/12/about-banner.png'
            }
          }
          
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
          if (parts[0] && (parts[0].includes('alluredigital.net') || parts[0].includes('rimalweb.net'))) {
            // If already has rimalweb.net, convert back to alluredigital.net for filename
            const urlToFix = parts[0].includes('rimalweb.net') 
              ? parts[0].replace(/rimalweb\.net/gi, 'alluredigital.net')
              : parts[0]
            return fixAssetUrl(urlToFix) + (parts[1] ? ' ' + parts[1] : '')
          }
          return src.trim()
        }).join(', ')
        return `srcset="${fixedSrcset}"`
      })
      
      // Fix URLs in style background images (including inline styles in HTML)
      bodyHtml = bodyHtml.replace(/url\(['"]?([^'")]*(?:alluredigital|rimalweb)\.net[^'")]*)['"]?\)/gi, (match, url) => {
        // Convert rimalweb.net back to alluredigital.net for filename lookup
        const urlToFix = url.includes('rimalweb.net') 
          ? url.replace(/rimalweb\.net/gi, 'alluredigital.net')
          : url
        const fixed = fixAssetUrl(urlToFix)
        return `url('${fixed}')`
      })
      
      // Also fix background-image in style attributes directly
      bodyHtml = bodyHtml.replace(/background-image:\s*url\(['"]?([^'")]*(?:alluredigital|rimalweb)\.net[^'")]*)['"]?\)/gi, (match, url) => {
        const urlToFix = url.includes('rimalweb.net') 
          ? url.replace(/rimalweb\.net/gi, 'alluredigital.net')
          : url
        const fixed = fixAssetUrl(urlToFix)
        return `background-image: url('${fixed}')`
      })
      
      // Also fix any rimalweb.net URLs that might have been replaced in HTML
      bodyHtml = bodyHtml.replace(/src="([^"]*rimalweb\.net[^"]*)"/gi, (match, url) => {
        // Convert back to alluredigital.net for filename
        const urlToFix = url.replace(/rimalweb\.net/gi, 'alluredigital.net')
        const fixed = fixAssetUrl(urlToFix)
        return `src="${fixed}"`
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
        
        // Replace in all heading elements
        tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6, .elementor-heading-title, .ha-gradient-heading, .ep-heading').forEach((heading) => {
          if (heading.textContent) {
            let text = heading.textContent.trim()
            const originalText = text
            
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
      
      containerRef.current.innerHTML = cleanedHtml
      
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
        // Helper function to create a nice placeholder SVG
        const createPlaceholderSvg = (width: number | string, height: number | string) => {
          const w = typeof width === 'string' ? parseInt(width) || 400 : width || 400
          const h = typeof height === 'string' ? parseInt(height) || 300 : height || 300
          return `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"%3E%3Crect width="100%25" height="100%25" fill="%23f5f5f5"/%3E%3Crect x="0" y="0" width="100%25" height="100%25" fill="url(%23gradient)"/%3E%3Cdefs%3E%3ClinearGradient id="gradient" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" style="stop-color:%23f0f0f0;stop-opacity:1" /%3E%3Cstop offset="100%25" style="stop-color:%23e0e0e0;stop-opacity:1" /%3E%3C/linearGradient%3E%3C/defs%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="Arial, sans-serif" font-size="16" fill="%23999"%3EImage%3C/text%3E%3C/svg%3E`
        }
        
        // Handle img tags - add error handlers for missing images
        containerRef.current.querySelectorAll('img[src]').forEach((img) => {
          const imgElement = img as HTMLImageElement
          const src = imgElement.getAttribute('src') || ''
          
          // Skip if already a placeholder
          if (src.includes('data:image/svg+xml')) return
          
          // Add error handler for missing images
          imgElement.onerror = function() {
            // Only replace if it's a local asset that failed
            if ((src.includes('/assets/') || src.includes('alluredigital.net') || src.includes('rimalweb.net')) && !src.includes('data:')) {
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
          if ((src.includes('/assets/') || src.includes('alluredigital.net') || src.includes('rimalweb.net')) && !src.includes('data:')) {
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
          
          // Check if this is the Welcome section desktop image
          const isWelcomeSection = element.closest('section, div')?.querySelector('h2, h1')?.textContent?.includes('Welcome to') || 
                                   element.closest('section, div')?.querySelector('h2, h1')?.textContent?.includes('Breaking Through') ||
                                   element.closest('section, div')?.querySelector('h2, h1')?.textContent?.includes('Digital Impasse')
          
          // Directly replace Welcome section desktop image with MACBOOK
          if (isWelcomeSection && element.classList.contains('bdt-scroll-image')) {
            const desktopImages = [
              '/assets/alluredigital.net_wp-content_uploads_2023_01_MACBOOK.png',
              '/assets/alluredigital.net_wp-content_uploads_2023_01_imac.png',
              '/assets/alluredigital.net_wp-content_uploads_2023_01_IPAD-VER.png',
              '/assets/alluredigital.net_wp-content_uploads_2023_01_responsive-devices.png'
            ]
            
            // Try to load MACBOOK image first
            let imageIndex = 0
            const tryNextImage = () => {
              if (imageIndex < desktopImages.length) {
                const testImg = new Image()
                testImg.onload = function() {
                  element.style.backgroundImage = `url('${desktopImages[imageIndex]}')`
                  element.style.backgroundSize = 'cover'
                  element.style.backgroundPosition = 'center'
                  element.style.backgroundRepeat = 'no-repeat'
                }
                testImg.onerror = function() {
                  imageIndex++
                  tryNextImage()
                }
                testImg.src = desktopImages[imageIndex]
              }
            }
            tryNextImage()
            return // Skip the rest for this element
          }
          
          // For other background images, check if they exist
          const style = element.getAttribute('style') || ''
          const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i)
          
          if (bgMatch && bgMatch[1]) {
            const bgUrl = bgMatch[1]
            
            // Preload background image to check if it exists
            if ((bgUrl.includes('/assets/') || bgUrl.includes('alluredigital.net') || bgUrl.includes('rimalweb.net')) && !bgUrl.includes('data:')) {
              const testImg = new Image()
              testImg.onerror = function() {
                // If image fails to load, set a fallback gradient background
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
        
        // Also handle data-settings background slideshow images - FORCE display
        // First, find homepage hero section and force about-banner image
        const homepageHeroSection = containerRef.current.querySelector('[data-settings*="background_slideshow_gallery"], [data-settings*="about-banner"]')
        if (homepageHeroSection) {
          const heroEl = homepageHeroSection as HTMLElement
          let aboutBannerUrl = fixAssetUrl('https://alluredigital.net/wp-content/uploads/2022/12/about-banner.png')
          // Add cache-busting parameter to force reload
          aboutBannerUrl += (aboutBannerUrl.includes('?') ? '&' : '?') + 'v=' + Date.now()
          
          // Force remove slideshow
          const slideshow = heroEl.querySelector('.elementor-background-slideshow')
          if (slideshow) {
            slideshow.remove()
          }
          
          // Force set background image - medium size (45%) with cache-busting
          heroEl.style.setProperty('background-image', `url('${aboutBannerUrl}')`, 'important')
          heroEl.style.setProperty('background-size', '45%', 'important')
          heroEl.style.setProperty('background-position', 'center', 'important')
          heroEl.style.setProperty('background-repeat', 'no-repeat', 'important')
          heroEl.style.setProperty('min-height', '500px', 'important')
          
          // Preload image with cache-busting
          const heroImg = new Image()
          heroImg.onload = function() {
            heroEl.style.setProperty('background-image', `url('${aboutBannerUrl}')`, 'important')
            heroEl.style.setProperty('background-size', '45%', 'important')
          }
          heroImg.src = aboutBannerUrl
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
              
              // Check if this is homepage hero section (has slideshow or about-banner)
              const isHomepageHero = (
                (parsed.background_background === 'slideshow' && parsed.background_slideshow_gallery) ||
                (parsed.background_background === 'classic' && parsed.background_image && parsed.background_image.url && parsed.background_image.url.includes('about-banner'))
              )
              
              // If this is the home page hero section, replace with about-banner
              if (isHomepageHero) {
                let aboutBannerUrl = fixAssetUrl('https://alluredigital.net/wp-content/uploads/2022/12/about-banner.png')
                // Add cache-busting parameter to force reload
                aboutBannerUrl += (aboutBannerUrl.includes('?') ? '&' : '?') + 'v=' + Date.now()
                
                // Remove slideshow elements if they exist
                const slideshow = element.querySelector('.elementor-background-slideshow')
                if (slideshow) {
                  slideshow.remove()
                }
                
                // Force set static background image - medium size (45% size) with cache-busting
                element.style.setProperty('background-image', `url('${aboutBannerUrl}')`, 'important')
                element.style.setProperty('background-size', '45%', 'important')
                element.style.setProperty('background-position', 'right center', 'important')
                element.style.setProperty('background-repeat', 'no-repeat', 'important')
                element.style.setProperty('min-height', '500px', 'important')
                element.style.setProperty('opacity', '1', 'important')
                
                // Also set on the section element directly
                const section = element.closest('.elementor-section')
                if (section) {
                  const sectionEl = section as HTMLElement
                  sectionEl.style.setProperty('background-image', `url('${aboutBannerUrl}')`, 'important')
                  sectionEl.style.setProperty('background-size', '45%', 'important')
                  sectionEl.style.setProperty('background-position', 'right center', 'important')
                  sectionEl.style.setProperty('background-repeat', 'no-repeat', 'important')
                }
                
                // Preload image and verify with cache-busting
                const testImg = new Image()
                testImg.onload = function() {
                  element.style.setProperty('background-image', `url('${aboutBannerUrl}')`, 'important')
                  element.style.setProperty('background-size', '45%', 'important')
                  element.style.setProperty('opacity', '1', 'important')
                  if (section) {
                    const sectionEl = section as HTMLElement
                    sectionEl.style.setProperty('background-image', `url('${aboutBannerUrl}')`, 'important')
                    sectionEl.style.setProperty('background-size', '45%', 'important')
                  }
                }
                testImg.onerror = function() {
                  console.warn('About banner image failed to load:', aboutBannerUrl)
                  // Try alternative path without size suffix
                  const altUrl = aboutBannerUrl.replace(/-\d+x\d+/, '')
                  if (altUrl !== aboutBannerUrl) {
                    element.style.setProperty('background-image', `url('${altUrl}')`, 'important')
                    testImg.src = altUrl
                  }
                }
                testImg.src = aboutBannerUrl
              } else if (parsed.background_background === 'slideshow' && parsed.background_slideshow_gallery && Array.isArray(parsed.background_slideshow_gallery) && parsed.background_slideshow_gallery.length > 0) {
                // Handle slideshow background images - ensure first image shows immediately
                const firstImage = parsed.background_slideshow_gallery[0]
                if (firstImage && firstImage.url) {
                  const firstImageUrl = fixAssetUrl(firstImage.url)
                  
                  // Force first image as background immediately (before slideshow starts)
                  element.style.backgroundImage = `url('${firstImageUrl}')`
                  element.style.backgroundSize = 'cover'
                  element.style.backgroundPosition = 'center'
                  element.style.backgroundRepeat = 'no-repeat'
                  element.style.minHeight = '500px' // Ensure section has height
                  
                  // Verify first image loads
                  const firstImg = new Image()
                  firstImg.onload = function() {
                    element.style.backgroundImage = `url('${firstImageUrl}')`
                    element.style.opacity = '1'
                  }
                  firstImg.onerror = function() {
                    console.warn('First slideshow image failed:', firstImageUrl)
                    // Try without size suffix
                    const altUrl = firstImageUrl.replace(/-\d+x\d+/, '')
                    if (altUrl !== firstImageUrl) {
                      element.style.backgroundImage = `url('${altUrl}')`
                      firstImg.src = altUrl
                    }
                  }
                  firstImg.src = firstImageUrl
                  
                  // Preload all slideshow images
                  parsed.background_slideshow_gallery.forEach((item: any, index: number) => {
                    if (item && item.url) {
                      const imageUrl = fixAssetUrl(item.url)
                      const testImg = new Image()
                      testImg.onload = function() {
                        // Image loaded successfully - update background if this is current slide
                        if (index === 0) {
                          element.style.backgroundImage = `url('${imageUrl}')`
                        }
                      }
                      testImg.onerror = function() {
                        console.warn('Slideshow image failed to load:', imageUrl)
                        // Try alternative path
                        const altUrl = imageUrl.replace(/-\d+x\d+/, '')
                        if (altUrl !== imageUrl) {
                          testImg.src = altUrl
                        }
                      }
                      testImg.src = imageUrl
                    }
                  })
                }
              }
            } catch (e) {
              console.warn('Failed to parse data-settings for background:', e)
            }
          }
        })
        
        // Fix slideshow slide images directly (they have inline styles)
        containerRef.current.querySelectorAll('.elementor-background-slideshow__slide__image, .swiper-slide').forEach((slide) => {
          const slideEl = slide as HTMLElement
          const bgImage = slideEl.style.backgroundImage || slideEl.getAttribute('style')
          
          if (bgImage && bgImage.includes('alluredigital.net')) {
            // Extract URL from style
            const urlMatch = bgImage.match(/url\(['"]?([^'")]+)['"]?\)/)
            if (urlMatch && urlMatch[1]) {
              const fixedUrl = fixAssetUrl(urlMatch[1])
              slideEl.style.backgroundImage = `url('${fixedUrl}')`
              slideEl.style.backgroundSize = 'cover'
              slideEl.style.backgroundPosition = 'center'
              
              // Preload image
              const testImg = new Image()
              testImg.onload = function() {
                slideEl.style.backgroundImage = `url('${fixedUrl}')`
                slideEl.style.opacity = '1'
              }
              testImg.onerror = function() {
                // Try without size suffix
                const altUrl = fixedUrl.replace(/-\d+x\d+/, '')
                if (altUrl !== fixedUrl) {
                  slideEl.style.backgroundImage = `url('${altUrl}')`
                }
              }
              testImg.src = fixedUrl
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
                    })
                  }
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

