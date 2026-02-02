#!/usr/bin/env python3
"""
Helper script to trigger scraping for a funding program.
Usage: python trigger_scraping.py <funding_program_id> [jwt_token]
"""
import sys
import requests


def scrape_funding_program(funding_program_id: int, jwt_token: str):
    """Trigger scraping for a funding program."""
    url = f"http://localhost:8000/funding-programs/{funding_program_id}/scrape"

    headers = {
        "Authorization": f"Bearer {jwt_token}",
        "Content-Type": "application/json"
    }

    print(f"Triggering scrape for funding program ID {funding_program_id}...")
    print(f"URL: {url}")

    try:
        response = requests.post(url, headers=headers, timeout=30)

        if response.status_code == 200:
            data = response.json()
            print("\n✅ Scraping successful!")
            print("\nResults:")
            print(f"  Title: {data.get('title', 'N/A')}")
            print(f"  Website: {data.get('website', 'N/A')}")
            print(f"  Description: {data.get('description', 'N/A')[:200]}..." if data.get('description') else "  Description: None")
            print(f"  Sections found: {len(data.get('sections_json', []))}")
            print(f"  Content hash: {data.get('content_hash', 'N/A')[:20]}..." if data.get('content_hash') else "  Content hash: None")
            print(f"  Last scraped: {data.get('last_scraped_at', 'N/A')}")

            if data.get('sections_json'):
                print("\n  Sections:")
                for i, section in enumerate(data['sections_json'][:5], 1):  # Show first 5
                    print(f"    {i}. {section.get('section_title', 'N/A')}")
                    if section.get('pdf_link'):
                        print(f"       PDF: {section['pdf_link']}")

            return True
        else:
            print(f"\n❌ Error: {response.status_code}")
            try:
                error_data = response.json()
                print(f"  Detail: {error_data.get('detail', 'Unknown error')}")
            except Exception:
                print(f"  Response: {response.text}")
            return False

    except requests.exceptions.ConnectionError:
        print("\n❌ Error: Cannot connect to backend server")
        print("  Make sure the backend is running on http://localhost:8000")
        return False
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python trigger_scraping.py <funding_program_id> [jwt_token]")
        print("\nExample:")
        print("  python trigger_scraping.py 4 YOUR_JWT_TOKEN")
        print("\nTo get a JWT token, log in via the API:")
        print("  POST http://localhost:8000/auth/login")
        print("  Body: {\"email\": \"your@email.com\", \"password\": \"yourpassword\"}")
        sys.exit(1)

    funding_program_id = int(sys.argv[1])

    if len(sys.argv) >= 3:
        jwt_token = sys.argv[2]
    else:
        # Try to get token from environment or prompt
        import os
        jwt_token = os.getenv("JWT_TOKEN")
        if not jwt_token:
            print("JWT token not provided. Please provide it as second argument or set JWT_TOKEN env var.")
            sys.exit(1)

    success = scrape_funding_program(funding_program_id, jwt_token)
    sys.exit(0 if success else 1)
