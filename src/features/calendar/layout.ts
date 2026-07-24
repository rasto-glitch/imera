// Pure layout math for the week/day time grid: place a day's timed
// occurrences so overlapping ones share the column width side by side.
// Standard interval-partitioning: occurrences chain into a cluster while each
// overlaps the cluster's running end; within a cluster each takes the first
// lane that is free, and every member renders at 1/laneCount width.

export interface TimedBox {
  /** Minutes from the day's start, clamped to [0, 1440]. */
  startMin: number;
  endMin: number;
}

export interface LaidOutBox {
  lane: number;
  laneCount: number;
}

const MIN_BOX_MINUTES = 20; // shorter events still get a tappable block

export function layoutDayColumn(boxes: TimedBox[]): LaidOutBox[] {
  const order = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => a.box.startMin - b.box.startMin || b.box.endMin - a.box.endMin);

  const result: LaidOutBox[] = boxes.map(() => ({ lane: 0, laneCount: 1 }));

  let cluster: { index: number; endMin: number; lane: number }[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const closeCluster = () => {
    for (const member of cluster) {
      result[member.index] = { lane: member.lane, laneCount: laneEnds.length };
    }
    cluster = [];
    laneEnds = [];
  };

  for (const { box, index } of order) {
    const visualEnd = Math.max(box.endMin, box.startMin + MIN_BOX_MINUTES);
    if (cluster.length > 0 && box.startMin >= clusterEnd) closeCluster();

    let lane = laneEnds.findIndex((end) => end <= box.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(visualEnd);
    } else {
      laneEnds[lane] = visualEnd;
    }
    cluster.push({ index, endMin: visualEnd, lane });
    clusterEnd = Math.max(clusterEnd, visualEnd);
  }
  closeCluster();

  return result;
}
