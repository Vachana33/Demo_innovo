"""
Preprocessing utilities for company data.
Handles website crawling and audio transcription in the background.
"""
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from typing import Optional
import logging
import traceback
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def crawl_website(url: str, max_pages: int = 20) -> Optional[str]:
    """
    Crawl a website and extract readable text from pages.
    Limits to same domain and max_pages to avoid infinite crawling.
    
    Args:
        url: The website URL to crawl
        max_pages: Maximum number of pages to crawl (default: 20)
    
    Returns:
        Combined text from all crawled pages, or None if crawling fails
    """
    if not url:
        return None
    
    try:
        logger.info(f"Starting website crawl: url={url}, max_pages={max_pages}")
        # Ensure URL has a scheme
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        parsed_url = urlparse(url)
        base_domain = f"{parsed_url.scheme}://{parsed_url.netloc}"
        
        visited_urls = set()
        all_text = []
        
        def extract_text_from_page(page_url: str) -> Optional[str]:
            """Extract readable text from a single page."""
            try:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
                response = requests.get(page_url, headers=headers, timeout=10)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Remove script and style elements
                for script in soup(["script", "style", "nav", "footer", "header"]):
                    script.decompose()
                
                # Get text
                text = soup.get_text()
                
                # Clean up whitespace
                lines = (line.strip() for line in text.splitlines())
                chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
                text = ' '.join(chunk for chunk in chunks if chunk)
                
                return text
            except Exception as e:
                logger.warning(f"Failed to extract text from {page_url}: {str(e)}")
                return None
        
        # Start with the main page
        queue = [url]
        visited_urls.add(url)
        
        while queue and len(visited_urls) <= max_pages:
            current_url = queue.pop(0)
            
            try:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
                response = requests.get(current_url, headers=headers, timeout=10)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Extract text from current page
                page_text = extract_text_from_page(current_url)
                if page_text:
                    all_text.append(page_text)
                
                # Find links to other pages on the same domain
                if len(visited_urls) < max_pages:
                    for link in soup.find_all('a', href=True):
                        href = link['href']
                        absolute_url = urljoin(base_domain, href)
                        parsed_link = urlparse(absolute_url)
                        
                        # Only follow links on the same domain
                        if (parsed_link.netloc == parsed_url.netloc and 
                            absolute_url not in visited_urls and
                            len(visited_urls) < max_pages):
                            queue.append(absolute_url)
                            visited_urls.add(absolute_url)
            
            except Exception as e:
                logger.warning(f"Failed to crawl {current_url}: {str(e)}")
                continue
        
        # Combine all text
        combined_text = '\n\n'.join(all_text)
        if combined_text.strip():
            logger.info(f"Website crawl completed: url={url}, pages_crawled={len(visited_urls)}, text_length={len(combined_text)}")
            return combined_text
        else:
            logger.warning(f"Website crawl completed but no text extracted: url={url}")
            return None
    
    except Exception as e:
        logger.error(f"Website crawl error: url={url}, error={str(e)}")
        return None


def transcribe_audio(audio_path: str) -> Optional[str]:
    """
    Transcribe audio file to text using OpenAI Whisper API.
    
    Args:
        audio_path: Path to the audio file
    
    Returns:
        Transcript text, or None if transcription fails
    """
    if not audio_path:
        return None
    
    try:
        from openai import OpenAI
        import openai
        
        logger.info(f"Starting audio transcription: audio_path={audio_path}")
        
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.error("OPENAI_API_KEY not found in environment")
            return None
        
        if not os.path.exists(audio_path):
            logger.error(f"Audio file does not exist: audio_path={audio_path}")
            return None
        
        # Note: OpenAI v1+ does not support proxies in constructor
        # Only pass api_key explicitly - do not pass proxies, http_client, or other proxy-related parameters
        
        # TEMP DEBUG — REMOVE AFTER PROXY ROOT CAUSE IS FOUND
        # Log OpenAI class and module info
        logger.warning("=== TEMP DEBUG: OpenAI Client Initialization (preprocessing.py) ===")
        logger.warning(f"OpenAI class repr: {repr(OpenAI)}")
        logger.warning(f"OpenAI module: {OpenAI.__module__}")
        logger.warning(f"OpenAI version: {openai.__version__}")
        
        # Log proxy-related environment variables (existence only, not values)
        proxy_env_vars = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"]
        for var in proxy_env_vars:
            exists = os.getenv(var) is not None
            logger.warning(f"Environment variable {var} exists: {exists}")
        
        # Prepare kwargs for logging
        kwargs = {"api_key": api_key}
        logger.warning(f"OpenAI constructor kwargs keys: {list(kwargs.keys())}")
        
        # Defensive check: look for any proxy-related keys in kwargs
        proxy_keywords = ["proxy", "proxies"]
        found_proxy_keys = [k for k in kwargs.keys() if any(pk in str(k).lower() for pk in proxy_keywords)]
        if found_proxy_keys:
            logger.error(f"CRITICAL: Found proxy-related keys in kwargs: {found_proxy_keys}")
            logger.error(f"Full kwargs: {kwargs}")
            logger.error("Stack trace:")
            logger.error(traceback.format_stack())
        else:
            logger.warning("No proxy-related keys found in kwargs")
        
        logger.warning("=== END TEMP DEBUG ===")
        # END TEMP DEBUG
        
        client = OpenAI(api_key=api_key)
        
        with open(audio_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="de"
            )
        
        transcript_text = transcript.text
        logger.info(f"Audio transcription completed: audio_path={audio_path}, transcript_length={len(transcript_text)}")
        return transcript_text
    
    except Exception as e:
        logger.error(f"Audio transcription error: audio_path={audio_path}, error={str(e)}")
        return None

