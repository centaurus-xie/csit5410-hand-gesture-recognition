"""Shared world-coordinate feature contract; mirrored in web/src/features.ts."""
import numpy as np

FEATURE_VERSION = "world-single-v1"

def features(points, hand):
    p = np.asarray([[v['x'], v['y'], v['z']] for v in points], dtype=float)
    if p.shape != (21, 3) or not np.isfinite(p).all():
        raise ValueError('Expected 21 finite world landmarks')
    if hand not in ('Left', 'Right'):
        raise ValueError('Unknown handedness')
    scale = np.linalg.norm(p[9] - p[0])
    if scale < 1e-8:
        raise ValueError('Degenerate palm scale')
    p = (p-p[0])/scale
    if hand == 'Left':
        p[:, 0] *= -1
    def unit(a):
        n = np.linalg.norm(a)
        if n < 1e-8:
            raise ValueError('Degenerate hand geometry')
        return a/n
    def angle(a, b):
        return np.arccos(np.clip(np.dot(unit(a), unit(b)), -1, 1))/np.pi
    bends = []
    for ids in ([1,2,3,4], [5,6,7,8], [9,10,11,12], [13,14,15,16], [17,18,19,20]):
        for i in (1, 2):
            bends.append(angle(p[ids[i-1]]-p[ids[i]], p[ids[i+1]]-p[ids[i]]))
    spread = [angle(p[b]-p[a], p[d]-p[c]) for a,b,c,d in ((5,8,9,12),(9,12,13,16),(13,16,17,20))]
    distances = [np.linalg.norm(p[4]-p[i]) for i in (8,12,16,20)]
    normal = unit(np.cross(p[5]-p[0], p[17]-p[0]))
    geometry = np.array([*bends, *spread, *distances, *normal])
    coordinates = p.flatten()
    anchors = p[[0,4,5,8,9,12,13,16,17,20]]
    shape = np.r_[geometry[:17], [np.linalg.norm(a-b) for i,a in enumerate(anchors) for b in anchors[i+1:]]]
    return {'shape':shape,'coordinates':coordinates, 'geometry':geometry, 'combined':np.concatenate([coordinates,geometry])}
