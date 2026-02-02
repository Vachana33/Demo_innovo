"""
Scraping utilities for funding program data.
Extracts structured data (program name, description, sections, PDF links) from funding program websites.
"""
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from typing import Optional, Dict, Any
import logging
import hashlib


logger = logging.getLogger(__name__)


def compute_content_hash(content: str) -> str:
    """Compute SHA256 hash of content for change detection."""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()


def scrape_funding_program(url: str) -> Optional[Dict[str, Any]]:
    """
    Scrape funding program details from a website.

    Args:
        url: The funding program website URL to scrape

    Returns:
        Dictionary with structure:
        {
            "program_name": str,
            "description": str,
            "sections": [
                {
                    "section_title": str,
                    "section_description": str,
                    "pdf_link": Optional[str]
                }
            ],
            "content_hash": str
        }
        Returns None if scraping fails.
    """
    if not url:
        logger.error("No URL provided for scraping")
        return None

    try:
        logger.info(f"[SCRAPING] Starting funding program scrape: url={url}")

        # Ensure URL has a scheme
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url

        # Fetch the page
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()

        # Parse HTML
        soup = BeautifulSoup(response.content, 'html.parser')

        # Extract program name (try multiple selectors)
        program_name = None
        # Try h1, h2, or title tag
        h1 = soup.find('h1')
        if h1:
            program_name = h1.get_text(strip=True)
        else:
            h2 = soup.find('h2')
            if h2:
                program_name = h2.get_text(strip=True)
            else:
                title_tag = soup.find('title')
                if title_tag:
                    program_name = title_tag.get_text(strip=True)

        if not program_name:
            program_name = "Funding Program"  # Fallback

        # Extract description (try to find main content area)
        description = None
        # Look for common content containers
        content_selectors = [
            'main', 'article', '.content', '#content', '.main-content',
            '.description', '.program-description', 'div[class*="description"]'
        ]

        for selector in content_selectors:
            content_elem = soup.select_one(selector)
            if content_elem:
                # Get text, excluding navigation and footer
                for nav in content_elem.find_all(['nav', 'footer', 'header']):
                    nav.decompose()
                description = content_elem.get_text(separator=' ', strip=True)
                # Limit description length
                if description:
                    description = description[:2000]  # First 2000 chars
                    break

        if not description:
            # Fallback: get all paragraph text
            paragraphs = soup.find_all('p')
            if paragraphs:
                description = ' '.join([p.get_text(strip=True) for p in paragraphs[:5]])[:2000]

        # Extract sections and PDF links
        sections = []

        # Look for common section patterns
        # 1. Look for headings (h2, h3) followed by content and PDF links
        headings = soup.find_all(['h2', 'h3'])
        base_url = f"{urlparse(url).scheme}://{urlparse(url).netloc}"

        for heading in headings:
            section_title = heading.get_text(strip=True)
            if not section_title or len(section_title) < 3:
                continue

            # Find content after this heading
            section_content = []
            current = heading.next_sibling

            # Collect text until next heading of same or higher level
            # Safely extract heading level (h1, h2, h3, etc.)
            heading_level = 3  # Default
            if heading.name and len(heading.name) >= 2 and heading.name[0] == 'h':
                try:
                    heading_level = int(heading.name[1])
                except (ValueError, IndexError):
                    heading_level = 3

            while current:
                if current.name and current.name.startswith('h') and len(current.name) >= 2:
                    current_level = 3  # Default
                    try:
                        current_level = int(current.name[1])
                    except (ValueError, IndexError):
                        current_level = 3
                    if current_level <= heading_level:
                        break

                if hasattr(current, 'get_text'):
                    text = current.get_text(strip=True)
                    if text:
                        section_content.append(text)

                current = current.next_sibling

            section_description = ' '.join(section_content[:3])[:500] if section_content else ""

            # Look for PDF links near this section
            pdf_link = None
            # Check the heading's parent and siblings for links
            parent = heading.parent if heading.parent else None
            if parent:
                pdf_links = parent.find_all('a', href=True)
                for link in pdf_links:
                    href = link.get('href', '')
                    if href.lower().endswith('.pdf') or 'pdf' in href.lower():
                        pdf_link = urljoin(base_url, href)
                        break

            # If no PDF found in parent, check next few siblings
            if not pdf_link:
                current = heading.next_sibling
                count = 0
                while current and count < 5:
                    if hasattr(current, 'find_all'):
                        pdf_links = current.find_all('a', href=True)
                        for link in pdf_links:
                            href = link.get('href', '')
                            if href.lower().endswith('.pdf') or 'pdf' in href.lower():
                                pdf_link = urljoin(base_url, href)
                                break
                    if pdf_link:
                        break
                    current = current.next_sibling
                    count += 1

            sections.append({
                "section_title": section_title,
                "section_description": section_description,
                "pdf_link": pdf_link
            })

        # If no sections found via headings, try alternative approach
        if not sections:
            # Look for lists or divs that might contain section information
            lists = soup.find_all(['ul', 'ol', 'div'], class_=lambda x: x and ('section' in x.lower() or 'program' in x.lower()))
            for list_elem in lists[:10]:  # Limit to first 10
                items = list_elem.find_all(['li', 'div', 'a'])
                for item in items[:5]:  # Limit to first 5 items per list
                    text = item.get_text(strip=True)
                    if text and len(text) > 10:
                        # Look for PDF link
                        pdf_link = None
                        link = item.find('a', href=True)
                        if link:
                            href = link.get('href', '')
                            if href.lower().endswith('.pdf') or 'pdf' in href.lower():
                                pdf_link = urljoin(base_url, href)

                        sections.append({
                            "section_title": text[:100],  # Limit title length
                            "section_description": "",
                            "pdf_link": pdf_link
                        })

        # Limit sections to reasonable number
        sections = sections[:20]

        # Build result
        result = {
            "program_name": program_name,
            "description": description or "",
            "sections": sections
        }

        # Compute content hash for change detection
        content_str = f"{program_name}|{description}|{len(sections)}"
        for section in sections:
            content_str += f"|{section.get('section_title', '')}|{section.get('pdf_link', '')}"

        result["content_hash"] = compute_content_hash(content_str)

        logger.info(f"[SCRAPING] Scraping completed: url={url}, program_name={program_name}, sections={len(sections)}")
        return result

    except requests.RequestException as e:
        logger.error(f"[SCRAPING] Request error scraping {url}: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"[SCRAPING] Error scraping {url}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return None
