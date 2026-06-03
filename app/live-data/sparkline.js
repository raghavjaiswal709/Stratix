export function generateSparklineSvgPath(ticks, width = 85, height = 30) {
  if (!ticks || ticks.length < 2) return "";

  const min = ticks.reduce((m, val) => val < m ? val : m, ticks[0]);
  const max = ticks.reduce((m, val) => val > m ? val : m, ticks[0]);
  const range = max - min;

  // Map each tick value to coordinates:
  // x: spread evenly across [0, width]
  // y: scale vertically [0, height], inverted since SVG y=0 is the top
  const points = ticks.map((val, idx) => {
    const x = (idx / (ticks.length - 1)) * width;
    const y = range === 0 ? height / 2 : height - ((val - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return `M ${points.join(" L ")}`;
}
