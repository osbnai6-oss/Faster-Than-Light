// Google Maps and Places API Integration
// Configuration
const USE_PROXY = true; // Set to false for Mode A (client-side), true for Mode B (serverless proxy)

// API Configuration - Mode A (Client-side)
// IMPORTANT: Restrict this key by HTTP referrer in Google Cloud Console!
window.GOOGLE_MAPS_API_KEY = 'REPLACE_WITH_YOUR_KEY';

// Default location (Accra, Ghana)
const DEFAULT_CENTER = { lat: 5.6037, lng: -0.1870 };
const DEFAULT_ZOOM = 13;
const DEFAULT_RADIUS = 3000; // meters

// Global variables
let map;
let markers = [];
let infoWindow;
let currentLocation = DEFAULT_CENTER;
let currentRadius = DEFAULT_RADIUS;

// Static sample data for testing without API
const STATIC_SAMPLES = [
    {
        name: "Premium Heights Residences",
        vicinity: "East Legon, Accra",
        geometry: {
            location: { lat: 5.6501, lng: -0.1615 }
        },
        price: "GH₵ 450,000",
        type: "3 Bedroom Townhouse",
        rating: 4.5
    },
    {
        name: "Cantonments Garden Estate",
        vicinity: "Cantonments, Accra",
        geometry: {
            location: { lat: 5.5695, lng: -0.1936 }
        },
        price: "GH₵ 850,000",
        type: "4 Bedroom Villa",
        rating: 4.8
    },
    {
        name: "Airport Residential Complex",
        vicinity: "Airport Hills, Accra",
        geometry: {
            location: { lat: 5.6057, lng: -0.1719 }
        },
        price: "GH₵ 320,000",
        type: "2 Bedroom Apartment",
        rating: 4.2
    }
];

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname.includes('listings.html')) {
        initPlacesInterface();
    }
});

// Initialize the Places interface
function initPlacesInterface() {
    bindEventListeners();
    showStatus('Ready to search for real estate agencies. Use the controls above to get started.', 'info');
}

// Initialize Google Map - called by Google Maps API
function initMap() {
    if (!document.getElementById('map')) return;
    
    try {
        map = new google.maps.Map(document.getElementById('map'), {
            zoom: DEFAULT_ZOOM,
            center: DEFAULT_CENTER,
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: true,
            zoomControl: true,
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }]
                }
            ]
        });
        
        infoWindow = new google.maps.InfoWindow();
        
        // Add a marker for the current center
        addCenterMarker(DEFAULT_CENTER);
        
        showStatus('Map initialized successfully! Enter a location or use "My Location" to get started.', 'success');
        
    } catch (error) {
        console.error('Error initializing map:', error);
        showStatus('Error initializing map. Please check your API key configuration.', 'error');
    }
}

// Bind event listeners
function bindEventListeners() {
    const searchForm = document.getElementById('searchForm');
    const useLocationBtn = document.getElementById('useLocationBtn');
    const resetMapBtn = document.getElementById('resetMapBtn');
    const radiusSelect = document.getElementById('radiusSelect');
    const dataSource = document.getElementById('dataSource');
    
    if (searchForm) {
        searchForm.addEventListener('submit', handleSearch);
    }
    
    if (useLocationBtn) {
        useLocationBtn.addEventListener('click', handleUseLocation);
    }
    
    if (resetMapBtn) {
        resetMapBtn.addEventListener('click', handleResetMap);
    }
    
    if (radiusSelect) {
        radiusSelect.addEventListener('change', function() {
            currentRadius = parseInt(this.value);
            // Re-run search if we have a current location
            if (currentLocation !== DEFAULT_CENTER) {
                searchNearby(currentLocation.lat, currentLocation.lng, currentRadius);
            }
        });
    }
    
    if (dataSource) {
        dataSource.addEventListener('change', function() {
            if (this.value === 'static') {
                showStaticSamples();
            } else {
                // Clear static samples and show instruction
                clearResults();
                showStatus('Switch to "Real Estate Agencies" mode. Use the search controls to find agencies.', 'info');
            }
        });
    }
}

// Handle search form submission
async function handleSearch(e) {
    e.preventDefault();
    
    const locationInput = document.getElementById('locationInput');
    const dataSourceSelect = document.getElementById('dataSource');
    const location = locationInput.value.trim();
    
    if (!location) {
        showStatus('Please enter a location to search.', 'error');
        return;
    }
    
    showStatus('Searching...', 'info');
    
    try {
        if (dataSourceSelect.value === 'static') {
            showStaticSamples();
        } else {
            // Geocode the location first
            const coords = await geocodeLocation(location);
            if (coords) {
                currentLocation = coords;
                map.setCenter(coords);
                map.setZoom(DEFAULT_ZOOM);
                
                // Add center marker
                clearMarkers();
                addCenterMarker(coords);
                
                // Search for nearby places
                await searchNearby(coords.lat, coords.lng, currentRadius);
            }
        }
    } catch (error) {
        console.error('Search error:', error);
        showStatus('Error during search. Please try again.', 'error');
    }
}

// Handle use current location
function handleUseLocation() {
    if (!navigator.geolocation) {
        showStatus('Geolocation is not supported by this browser.', 'error');
        return;
    }
    
    showStatus('Getting your location...', 'info');
    
    navigator.geolocation.getCurrentPosition(
        async function(position) {
            const coords = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            
            currentLocation = coords;
            map.setCenter(coords);
            map.setZoom(DEFAULT_ZOOM);
            
            // Clear previous markers and add current location
            clearMarkers();
            addCenterMarker(coords, 'Your Location');
            
            // Search nearby
            const dataSourceSelect = document.getElementById('dataSource');
            if (dataSourceSelect.value === 'static') {
                showStaticSamples();
            } else {
                await searchNearby(coords.lat, coords.lng, currentRadius);
            }
        },
        function(error) {
            console.error('Geolocation error:', error);
            let message = 'Unable to get your location. ';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    message += 'Please allow location access and try again.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    message += 'Location information unavailable.';
                    break;
                case error.TIMEOUT:
                    message += 'Location request timed out.';
                    break;
                default:
                    message += 'An unknown error occurred.';
                    break;
            }
            showStatus(message, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
        }
    );
}

// Handle reset map
function handleResetMap() {
    currentLocation = DEFAULT_CENTER;
    currentRadius = DEFAULT_RADIUS;
    
    map.setCenter(DEFAULT_CENTER);
    map.setZoom(DEFAULT_ZOOM);
    
    clearMarkers();
    clearResults();
    
    // Reset form
    document.getElementById('locationInput').value = '';
    document.getElementById('radiusSelect').value = DEFAULT_RADIUS;
    document.getElementById('dataSource').value = 'agencies';
    
    addCenterMarker(DEFAULT_CENTER);
    showStatus('Map reset to default location (Accra, Ghana).', 'success');
}

// Geocode location using Google Geocoding API
async function geocodeLocation(address) {
    if (!google || !google.maps) {
        throw new Error('Google Maps not loaded');
    }
    
    return new Promise((resolve, reject) => {
        const geocoder = new google.maps.Geocoder();
        
        geocoder.geocode({ address: address }, function(results, status) {
            if (status === 'OK' && results[0]) {
                const location = results[0].geometry.location;
                resolve({
                    lat: location.lat(),
                    lng: location.lng()
                });
            } else {
                showStatus(`Geocoding failed: ${status}. Please try a different location.`, 'error');
                reject(new Error(`Geocoding failed: ${status}`));
            }
        });
    });
}

// Search for nearby places
async function searchNearby(lat, lng, radius) {
    const dataSourceSelect = document.getElementById('dataSource');
    
    if (dataSourceSelect.value === 'static') {
        showStaticSamples();
        return;
    }
    
    showLoading(document.getElementById('results'), 'Searching for real estate agencies...');
    
    try {
        let results;
        
        if (USE_PROXY) {
            // Mode B: Use serverless proxy (recommended)
            results = await searchViaProxy(lat, lng, radius);
        } else {
            // Mode A: Direct API call (may have CORS issues)
            results = await searchViaDirect(lat, lng, radius);
        }
        
        if (results && results.length > 0) {
            displayResults(results);
            addMarkersToMap(results);
            showStatus(`Found ${results.length} real estate agencies nearby.`, 'success');
        } else {
            clearResults();
            showStatus('No real estate agencies found in this area. Try expanding your search radius.', 'info');
        }
        
    } catch (error) {
        console.error('Search error:', error);
        clearResults();
        showStatus('Error searching for agencies. Please try again or check your API configuration.', 'error');
    }
}

// Search via serverless proxy (Mode B - Recommended)
async function searchViaProxy(lat, lng, radius) {
    const url = `/.netlify/functions/placesProxy?lat=${lat}&lng=${lng}&radius=${radius}&type=real_estate_agency`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`Proxy request failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
        throw new Error(data.error);
    }
    
    return data.results || [];
}

// Search via direct API call (Mode A - may have CORS issues)
async function searchViaDirect(lat, lng, radius) {
    // Note: This will likely fail due to CORS restrictions
    // Google Places API doesn't allow direct browser requests
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=real_estate_agency&key=${window.GOOGLE_MAPS_API_KEY}`;
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'OK') {
            return data.results || [];
        } else {
            throw new Error(`Places API error: ${data.status}`);
        }
        
    } catch (error) {
        // CORS error expected - show helpful message
        if (error.message.includes('CORS') || error.name === 'TypeError') {
            showStatus('Direct API access blocked by CORS. Please use Mode B (serverless proxy) for production.', 'error');
        }
        throw error;
    }
}

// Show static sample data
function showStaticSamples() {
    clearMarkers();
    addCenterMarker(currentLocation, currentLocation === DEFAULT_CENTER ? 'Search Center' : 'Your Location');
    
    displayResults(STATIC_SAMPLES);
    addMarkersToMap(STATIC_SAMPLES);
    
    showStatus(`Showing ${STATIC_SAMPLES.length} sample properties. Switch to "Real Estate Agencies" to use live data.`, 'success');
}

// Display results in sidebar
function displayResults(results) {
    const resultsContainer = document.getElementById('results');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '';
    
    if (!results || results.length === 0) {
        resultsContainer.innerHTML = '<p class="no-results">No results found.</p>';
        return;
    }
    
    results.forEach((place, index) => {
        const resultElement = createResultElement(place, index);
        resultsContainer.appendChild(resultElement);
    });
}

// Create result element
function createResultElement(place, index) {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.setAttribute('tabindex', '0');
    div.setAttribute('role', 'button');
    
    const title = place.name || 'Unknown';
    const address = place.vicinity || place.formatted_address || 'Address not available';
    const rating = place.rating ? `⭐ ${place.rating}` : '';
    const price = place.price || '';
    const type = place.type || '';
    
    let content = `
        <div class="result-title">${title}</div>
        <div class="result-address">${address}</div>
    `;
    
    if (rating) {
        content += `<div class="result-rating">${rating}</div>`;
    }
    
    if (price) {
        content += `<div class="result-price">${price}</div>`;
    }
    
    if (type) {
        content += `<div class="result-type">${type}</div>`;
    }
    
    // Add Google Maps link for real places
    if (place.place_id) {
        content += `<a href="https://www.google.com/maps/place/?q=place_id:${place.place_id}" 
                   target="_blank" class="result-link" rel="noopener noreferrer">
                   View on Google Maps</a>`;
    }
    
    div.innerHTML = content;
    
    // Add click handler to center map on this location
    div.addEventListener('click', function() {
        const location = place.geometry?.location;
        if (location) {
            const coords = location.lat ? 
                { lat: location.lat(), lng: location.lng() } : 
                { lat: location.lat, lng: location.lng };
            
            map.setCenter(coords);
            map.setZoom(16);
            
            // Open info window for this marker
            if (markers[index]) {
                google.maps.event.trigger(markers[index], 'click');
            }
        }
    });
    
    // Keyboard support
    div.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.click();
        }
    });
    
    return div;
}

// Add markers to map
function addMarkersToMap(places) {
    clearMarkers();
    
    // Add center marker first
    addCenterMarker(currentLocation, currentLocation === DEFAULT_CENTER ? 'Search Center' : 'Your Location');
    
    places.forEach((place, index) => {
        const location = place.geometry?.location;
        if (!location) return;
        
        const coords = location.lat ? 
            { lat: location.lat(), lng: location.lng() } : 
            { lat: location.lat, lng: location.lng };
        
        const marker = new google.maps.Marker({
            position: coords,
            map: map,
            title: place.name || 'Unknown',
            icon: {
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#e53e3e"/>
                    </svg>
                `),
                scaledSize: new google.maps.Size(24, 24)
            }
        });
        
        // Create info window content
        let infoContent = `
            <div style="max-width: 300px;">
                <h3 style="margin: 0 0 8px 0; color: #1e293b;">${place.name || 'Unknown'}</h3>
                <p style="margin: 4px 0; color: #64748b;">${place.vicinity || place.formatted_address || 'Address not available'}</p>
        `;
        
        if (place.rating) {
            infoContent += `<p style="margin: 4px 0; color: #f59e0b;">⭐ Rating: ${place.rating}</p>`;
        }
        
        if (place.price) {
            infoContent += `<p style="margin: 4px 0; font-weight: 600; color: #059669;">${place.price}</p>`;
        }
        
        if (place.type) {
            infoContent += `<p style="margin: 4px 0; color: #6366f1;">${place.type}</p>`;
        }
        
        if (place.place_id) {
            infoContent += `
                <p style="margin: 8px 0 0 0;">
                    <a href="https://www.google.com/maps/place/?q=place_id:${place.place_id}" 
                       target="_blank" rel="noopener noreferrer"
                       style="color: #2563eb; text-decoration: none;">
                       View on Google Maps →
                    </a>
                </p>
            `;
        }
        
        infoContent += '</div>';
        
        marker.addListener('click', function() {
            infoWindow.setContent(infoContent);
            infoWindow.open(map, marker);
        });
        
        markers.push(marker);
    });
}

// Add center marker
function addCenterMarker(coords, title = 'Search Center') {
    const marker = new google.maps.Marker({
        position: coords,
        map: map,
        title: title,
        icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.