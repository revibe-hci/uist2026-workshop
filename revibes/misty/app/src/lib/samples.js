export const SAMPLE_EXAMPLES = [
  { name: 'Store: featured card', src: '/examples/store-featured.svg' },
  { name: 'Health: dark list', src: '/examples/health-dark.svg' },
  { name: 'Profile: carousel + Edit', src: '/examples/profile-carousel.svg' },
  { name: 'Hand-drawn sketch', src: '/examples/hand-sketch.svg' },
  // 3D remix: references with 3D elements (rendered by scripts/make-3d-examples.mjs)
  { name: '3D: product hero', src: '/examples/3d-product.png' },
  { name: '3D: stats with 3D chart', src: '/examples/3d-stats.png' },
];

const park = (name, place, rating, level, distance, time) => `
        <div className="border border-gray-100 rounded-md p-3 mb-3 bg-white">
          <h3 className="font-semibold text-gray-800">${name}</h3>
          <p className="text-sm text-gray-600">${place}</p>
          <p className="text-xs text-gray-500 mt-1">⭐ ${rating} · ${level} ${distance} mi · Est. ${time}</p>
          <button className="text-xs text-red-700 mt-2">Delete</button>
        </div>`;

// The work-in-progress UI of Figure 1.
export const PARKS_CODE = `() => {
  return (
    <div className="p-3 bg-white min-h-full">
      <input className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mb-3" placeholder="Find parks" />
      <div className="flex gap-2 mb-3">
        <span className="bg-gray-100 rounded px-2 py-1 text-sm text-gray-700">Nearby</span>
        <span className="bg-gray-100 rounded px-2 py-1 text-sm text-gray-700">Epic views</span>
        <span className="bg-gray-100 rounded px-2 py-1 text-sm text-gray-700">Wildflowers</span>
      </div>
      <div>${[
        park('Steep Ravine, Dipsea and Matt Davis', 'Stinson Beach, California', '4.8', 'Moderate', '6.60', '3h 41m'),
        park('Bear Mountain, Appalachian Trail', 'Bear Mountain, New York', '4.7', 'Hard', '4.00', '2h 20m'),
        park('Sunset Ridge, Griffith Park', 'Los Angeles, California', '4.9', 'Easy', '3.20', '1h 30m'),
        park('Yosemite Falls Trail', 'Yosemite National Park, California', '4.8', 'Hard', '7.20', '6h 00m'),
        park("Angel's Landing", 'Zion National Park, Utah', '4.9', 'Hard', '5.40', '4h 00m'),
      ].join('')}
      </div>
    </div>
  );
}`;

// Fuji's profile page from the example usage scenario (Section 2).
export const PROFILE_CODE = `() => {
  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="text-center">
        <img src="/stock/portrait1.jpg" className="w-20 h-20 rounded-full object-cover mx-auto" />
        <h1 className="font-semibold text-gray-900 mt-3">Fuji</h1>
        <p className="text-sm text-gray-500 mt-1">Passionate nature photographer. Find me by the water, or in the woods.</p>
        <p className="text-xs text-gray-500 mt-3">Email: photos@fuji.net</p>
        <p className="text-xs text-gray-500">Phone: +123 456 7890</p>
      </div>
      <h2 className="font-semibold text-gray-900 mt-6 mb-2">Interests</h2>
      <div className="bg-gray-100 rounded px-3 py-2 mb-2 text-sm text-gray-800">Film Camera</div>
      <div className="bg-gray-100 rounded px-3 py-2 mb-2 text-sm text-gray-800">Lofi Music</div>
      <div className="bg-gray-100 rounded px-3 py-2 mb-2 text-sm text-gray-800">Mid-Century Furniture</div>
      <div className="bg-gray-100 rounded px-3 py-2 mb-2 text-sm text-gray-800">Music Production</div>
    </div>
  );
}`;

export const SAMPLE_SOURCES = [
  { name: 'Find parks (Figure 1)', code: PARKS_CODE },
  { name: "Fuji's profile (Section 2)", code: PROFILE_CODE },
];
