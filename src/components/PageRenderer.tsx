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
    if (head) {
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
            document.head.appendChild(clone)
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
        const existing = document.querySelector(
          el.tagName === 'META'
            ? `meta[name="${el.getAttribute('name') || el.getAttribute('property')}"]`
            : 'title'
        )
        if (!existing) {
          const clone = el.cloneNode(true) as HTMLElement
          
          // Replace branding in title
          if (el.tagName === 'TITLE' && clone.textContent) {
            clone.textContent = clone.textContent
              .replace(/Allure Digital/gi, 'Rimalweb')
              .replace(/AllureDigital/gi, 'Rimalweb')
              .replace(/allure digital/gi, 'Rimalweb')
          }
          
          // Replace branding in meta content
          if (el.tagName === 'META') {
            const content = clone.getAttribute('content')
            if (content) {
              clone.setAttribute('content', content
                .replace(/Allure Digital/gi, 'Rimalweb')
                .replace(/AllureDigital/gi, 'Rimalweb')
                .replace(/allure digital/gi, 'Rimalweb')
                .replace(/alluredigital\.net/gi, 'rimalweb.com'))
            }
          }
          
          document.head.appendChild(clone)
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
            const originalWidth = parseInt(img.getAttribute('width') || img.offsetWidth.toString() || '200')
            const originalHeight = parseInt(img.getAttribute('height') || img.offsetHeight.toString() || '50')
            
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
              const originalWidth = parseInt(img.getAttribute('width') || img.offsetWidth.toString() || '200')
              const originalHeight = parseInt(img.getAttribute('height') || img.offsetHeight.toString() || '50')
              
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
              // Add style to make it bigger while preserving original
              newLogo.setAttribute('style', `width: ${width}px; height: ${height}px; object-fit: contain; ${opacityStyle}${style}`)
              
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

      // Fix internal links and remove contact links
      body.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href')
        
        // Remove tel: and mailto: links
        if (href && (href.startsWith('tel:') || href.startsWith('mailto:'))) {
          a.removeAttribute('href')
          const currentStyle = a.getAttribute('style') || ''
          a.setAttribute('style', `${currentStyle} pointer-events: none; cursor: default;`.trim())
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
              '/local-seo': '/local-seo',
              '/ppc-advertising': '/ppc-advertising',
              '/wordpress-development': '/wordpress-development',
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
        tempDiv.querySelectorAll('[data-title], [data-text], [data-content]').forEach((el) => {
          ['data-title', 'data-text', 'data-content'].forEach((attr) => {
            const value = el.getAttribute(attr)
            if (value && (value.includes('Allure') || value.includes('allure'))) {
              el.setAttribute(attr, value
                .replace(/Allure Digital/gi, 'Rimalweb')
                .replace(/AllureDigital/gi, 'Rimalweb'))
            }
          })
        })
        
        return tempDiv.innerHTML
      }

      // Remove contact info (phone, email, address) before setting content
      const removeContactInfo = (html: string): string => {
        // Remove phone numbers (all formats)
        html = html.replace(/\(212\)\s*301-7615/gi, '')
        html = html.replace(/212-301-7615/gi, '')
        html = html.replace(/\(212\)\s*301\s*7615/gi, '')
        html = html.replace(/212\s*301\s*7615/gi, '')
        html = html.replace(/tel:[\d\s\-\(\)]+/gi, '')
        
        // Remove email addresses
        html = html.replace(/info@alluredigital\.net/gi, '')
        html = html.replace(/[a-zA-Z0-9._%+-]+@alluredigital\.net/gi, '')
        html = html.replace(/mailto:[a-zA-Z0-9._%+-]+@alluredigital\.net/gi, '')
        
        // Remove addresses
        html = html.replace(/5300\s*Kings\s*Highway\s*Brooklyn[^<]*/gi, '')
        html = html.replace(/Brooklyn,\s*NY\s*11234/gi, '')
        
        // Remove contact info from text content
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = html
        tempDiv.querySelectorAll('*').forEach((el) => {
          if (el.textContent) {
            let text = el.textContent
            text = text.replace(/\(212\)\s*301-7615/gi, '')
            text = text.replace(/212-301-7615/gi, '')
            text = text.replace(/info@alluredigital\.net/gi, '')
            text = text.replace(/5300\s*Kings\s*Highway/gi, '')
            text = text.replace(/Brooklyn,\s*NY\s*11234/gi, '')
            if (text !== el.textContent && el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
              el.textContent = text.trim()
            }
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
      
      // Fix URLs in style background images
      bodyHtml = bodyHtml.replace(/url\(['"]?([^'")]*(?:alluredigital|rimalweb)\.net[^'")]*)['"]?\)/gi, (match, url) => {
        // Convert rimalweb.net back to alluredigital.net for filename lookup
        const urlToFix = url.includes('rimalweb.net') 
          ? url.replace(/rimalweb\.net/gi, 'alluredigital.net')
          : url
        const fixed = fixAssetUrl(urlToFix)
        return `url('${fixed}')`
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
      cleanedHtml = removeContactInfo(cleanedHtml)
      containerRef.current.innerHTML = cleanedHtml

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
        
        // Also handle data-settings background slideshow images
        containerRef.current.querySelectorAll('[data-settings]').forEach((el) => {
          const settings = el.getAttribute('data-settings')
          if (settings && settings.includes('background_slideshow_gallery')) {
            try {
              // Decode HTML entities properly
              const decoded = settings
                .replace(/&amp;/g, '&')  // Must decode &amp; first
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'")
              
              const parsed = JSON.parse(decoded)
              
              // If this is the home page hero section with slideshow, replace with about-banner
              if (parsed.background_background === 'classic' && parsed.background_image && parsed.background_image.url && parsed.background_image.url.includes('about-banner')) {
                const element = el as HTMLElement
                const aboutBannerUrl = fixAssetUrl(parsed.background_image.url)
                
                // Remove slideshow elements if they exist
                const slideshow = element.querySelector('.elementor-background-slideshow')
                if (slideshow) {
                  slideshow.remove()
                }
                
                // Set static background image - make it smaller (70% size)
                element.style.backgroundImage = `url('${aboutBannerUrl}')`
                element.style.backgroundSize = '70%'
                element.style.backgroundPosition = 'center'
                element.style.backgroundRepeat = 'no-repeat'
              } else if (parsed.background_slideshow_gallery && Array.isArray(parsed.background_slideshow_gallery)) {
                parsed.background_slideshow_gallery.forEach((item: any) => {
                  if (item && item.url && (item.url.includes('/assets/') || item.url.includes('alluredigital.net') || item.url.includes('rimalweb.net'))) {
                    const testImg = new Image()
                    testImg.onerror = function() {
                      // If slideshow image fails, we'll let the background fallback handle it
                      const element = el as HTMLElement
                      if (!element.style.background) {
                        element.style.background = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #f5f5f5 100%)'
                        element.style.backgroundColor = '#f5f5f5'
                      }
                    }
                    testImg.src = item.url
                  }
                })
              }
            } catch (e) {
              // Silently ignore JSON parse errors to prevent breaking the page
              // The slideshow will just use the original URLs
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

      // Wait for scripts to load, then trigger DOM ready
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
          
          // Hide loading after a short delay to ensure everything is rendered
          setTimeout(() => {
            setIsLoading(false)
          }, 300)
        }).catch(() => {
          // Even if scripts fail, hide loading
          setIsLoading(false)
        })
      } else {
        // No scripts to load, hide loading after content is set
        setTimeout(() => {
          setIsLoading(false)
        }, 100)
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
          backgroundColor: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #dc2626',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '20px'
          }} />
          <div style={{
            color: '#dc2626',
            fontSize: '18px',
            fontWeight: 500
          }}>
            Loading Rimalweb...
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

