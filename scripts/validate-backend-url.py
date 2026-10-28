import ipaddress
import os
import sys
from urllib.parse import urlparse


def validate(value):
    url = urlparse(value)
    host = (url.hostname or "").lower().rstrip(".")
    if (url.scheme != "https" or not host or url.username or url.password
            or url.query or url.fragment or url.path not in ("", "/")):
        raise ValueError("BACKEND_URL must be an HTTPS origin without credentials, path, query or fragment")
    if host == "localhost" or host.endswith((".localhost", ".local", ".test", ".invalid", ".example")) or "." not in host:
        raise ValueError("BACKEND_URL must be a public production hostname")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("BACKEND_URL must not be a private, loopback or reserved IP")
    if url.port not in (None, 443):
        raise ValueError("Production BACKEND_URL must use HTTPS port 443")
    return url.geturl()


if __name__ == "__main__":
    try:
        validate(os.environ.get("BACKEND_URL", ""))
    except (ValueError, TypeError) as error:
        sys.exit(str(error))
    print("Production backend configuration validated")
