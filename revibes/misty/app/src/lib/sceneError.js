import { createContext } from 'react';

// 3D remix: lets a 3D scene inside a rendered UI report its errors to the node,
// without CodeRender importing three.js (which is loaded only when needed).
export const SceneErrorContext = createContext(null);
