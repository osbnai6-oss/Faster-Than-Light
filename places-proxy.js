// Netlify Function for Google Places API Proxy
// This function acts as a secure proxy to avoid CORS issues and keep API keys server-side

exports.handler = async (event, context) => {
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle OPTIONS request for CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ 
                error: 'Method not allowed. Use GET.' 
            })
        };
    }

    try {
        // Get API key from environment variables
        const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
        
        if (!API_KEY) {
            console.error('GOOGLE_MAPS_API_KEY environment variable not set');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Server configuration error. API key not found.' 
                })
            };
        }

        // Extract and validate query parameters
        const { queryStringParameters } = event;
        
        if (!queryStringParameters) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Missing query parameters. Required: lat, lng, radius' 
                })
            };
        }

        const { lat, lng, radius, type = 'real_estate_agency' } = queryStringParameters;

        // Validate required parameters
        if (!lat || !lng || !radius) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Missing required parameters. Required: lat, lng, radius' 
                })
            };
        }

        // Validate parameter formats
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        const searchRadius = parseInt(radius);

        if (isNaN(latitude) || isNaN(longitude) || isNaN(searchRadius)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Invalid parameter format. lat and lng must be numbers, radius must be an integer.' 
                })
            };
        }

        // Validate parameter ranges
        if (latitude < -90 || latitude > 90) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Invalid latitude. Must be between -90 and 90.' 
                })
            };
        }

        if (longitude < -180 || longitude > 180) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Invalid longitude. Must be between -180 and 180.' 
                })
            };
        }

        if (searchRadius < 1 || searchRadius > 50000) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Invalid radius. Must be between 1 and 50000 meters.' 
                })
            };
        }

        // Validate place type
        const allowedTypes = [
            'real_estate_agency',
            'establishment',
            'point_of_interest'
        ];

        if (!allowedTypes.includes(type)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: `Invalid type. Allowed types: ${allowedTypes.join(', ')}` 
                })
            };
        }

        // Build Google Places API URL
        const placesUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
        placesUrl.searchParams.append('location', `${latitude},${longitude}`);
        placesUrl.searchParams.append('radius', searchRadius.toString());
        placesUrl.searchParams.append('type', type);
        placesUrl.searchParams.append('key', API_KEY);

        console.log(`Making request to Google Places API: ${placesUrl.toString().replace(API_KEY, 'HIDDEN_KEY')}`);

        // Make request to Google Places API
        const response = await fetch(placesUrl.toString());

        if (!response.ok) {
            console.error(`Google Places API error: ${response.status} ${response.statusText}`);
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({ 
                    error: `Google Places API error: ${response.status}` 
                })
            };
        }

        const data = await response.json();

        // Check Google Places API response status
        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            console.error(`Google Places API returned status: ${data.status}`, data.error_message);
            
            let errorMessage = 'Google Places API error';
            switch (data.status) {
                case 'OVER_QUERY_LIMIT':
                    errorMessage = 'API quota exceeded. Please try again later.';
                    break;
                case 'REQUEST_DENIED':
                    errorMessage = 'API request denied. Please check API key configuration.';
                    break;
                case 'INVALID_REQUEST':
                    errorMessage = 'Invalid request parameters.';
                    break;
                default:
                    errorMessage = `Google Places API error: ${data.status}`;
            }

            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({ 
                    error: errorMessage,
                    details: data.error_message || data.status
                })
            };
        }

        // Log successful request
        const resultCount = data.results ? data.results.length : 0;
        console.log(`Successfully fetched ${resultCount} places for location (${latitude}, ${longitude}) with radius ${searchRadius}m`);

        // Filter and clean up the response data
        const cleanResults = data.results ? data.results.map(place => ({
            place_id: place.place_id,
            name: place.name,
            vicinity: place.vicinity,
            formatted_address: place.formatted_address,
            geometry: place.geometry,
            rating: place.rating,
            price_level: place.price_level,
            types: place.types,
            opening_hours: place.opening_hours ? {
                open_now: place.opening_hours.open_now
            } : undefined
        })) : [];

        // Return successful response
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status: data.status,
                results: cleanResults,
                next_page_token: data.next_page_token,
                // Include metadata for debugging
                metadata: {
                    query: {
                        location: `${latitude},${longitude}`,
                        radius: searchRadius,
                        type: type
                    },
                    timestamp: new Date().toISOString(),
                    result_count: cleanResults.length
                }
            })
        };

    } catch (error) {
        console.error('Function error:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
            })
        };
    }
};

// Export for local testing
if (require.main === module) {
    // Local testing function
    const testEvent = {
        httpMethod: 'GET',
        queryStringParameters: {
            lat: '5.6037',
            lng: '-0.1870',
            radius: '3000',
            type: 'real_estate_agency'
        }
    };

    exports.handler(testEvent, {})
        .then(result => {
            console.log('Test result:', JSON.stringify(result, null, 2));
        })
        .catch(error => {
            console.error('Test error:', error);
        });
}