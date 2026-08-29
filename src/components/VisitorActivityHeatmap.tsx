import React, { useEffect, useRef, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";
import * as d3 from "d3";
import { RefreshCw, BarChart2 } from "lucide-react";

interface ScanRecord {
  id: string;
  visitorName: string;
  horseId: string;
  horseName: string;
  requestedAt?: string;
  scanDate?: string;
}

export default function VisitorActivityHeatmap() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to visitor scanned horses history
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "visitor_scanned_horses"),
      (snapshot) => {
        const list: ScanRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as ScanRecord);
        });
        setScans(list);
        setLoading(false);
      },
      (err) => {
        console.error("Heatmap sub error:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Render Heatmap using D3
  useEffect(() => {
    if (loading || !svgRef.current || !containerRef.current) return;

    // Clear previous drawing
    d3.select(svgRef.current).selectAll("*").remove();

    // Setup dimensions based on parent container width
    const containerWidth = containerRef.current.getBoundingClientRect().width || 450;
    const margin = { top: 30, right: 20, bottom: 40, left: 45 };
    const height = 240;
    const width = containerWidth - margin.left - margin.right;

    const svg = d3
      .select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Prepare data
    // Days: Mon-Sun (0-6)
    // Hours: 0-23
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const hours = Array.from({ length: 24 }, (_, i) => i);

    // Initialize the matrix with 0s
    interface MatrixCell {
      dayIdx: number;
      dayLabel: string;
      hour: number;
      count: number;
    }
    const matrix: MatrixCell[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        matrix.push({
          dayIdx: d,
          dayLabel: days[d],
          hour: h,
          count: 0,
        });
      }
    }

    // Populate data
    scans.forEach((scan) => {
      let date: Date;
      if (scan.requestedAt) {
        date = new Date(scan.requestedAt);
      } else if (scan.scanDate) {
        // Fallback parse locale date or assume default
        date = new Date(scan.scanDate);
      } else {
        return;
      }

      if (isNaN(date.getTime())) return;

      const dIdx = (date.getDay() + 6) % 7; // Convert 0-6 (Sun-Sat) to 0-6 (Mon-Sun)
      const hr = date.getHours();

      const cell = matrix.find((c) => c.dayIdx === dIdx && c.hour === hr);
      if (cell) {
        cell.count += 1;
      }
    });

    // Scales
    const xScale = d3
      .scaleBand<number>()
      .range([0, width])
      .domain(hours)
      .padding(0.08);

    const yScale = d3
      .scaleBand<string>()
      .range([0, height])
      .domain(days)
      .padding(0.08);

    const maxCount = d3.max(matrix, (d) => d.count) || 1;

    // Elegant slate-teal theme palette for heatmap cells
    const colorScale = d3
      .scaleLinear<string>()
      .domain([0, Math.max(1, maxCount * 0.2), Math.max(2, maxCount * 0.6), maxCount])
      .range(["#f5f5f4", "#ccfbf1", "#2dd4bf", "#0f766e"]); // Off-white -> Light teal -> Vibrant teal -> Dark teal

    // Grid cells
    svg
      .selectAll(".cell")
      .data(matrix)
      .enter()
      .append("rect")
      .attr("class", "cell")
      .attr("x", (d) => xScale(d.hour) || 0)
      .attr("y", (d) => yScale(d.dayLabel) || 0)
      .attr("width", xScale.bandwidth())
      .attr("height", yScale.bandwidth())
      .style("fill", (d) => colorScale(d.count))
      .attr("rx", 3)
      .attr("ry", 3)
      .style("stroke", "transparent")
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        d3.select(this)
          .style("stroke", "#0f766e")
          .style("stroke-width", "1.5px");

        // Tooltip
        tooltip
          .transition()
          .duration(100)
          .style("opacity", 0.95);
        tooltip
          .html(`
            <div class="px-2 py-1 text-[10px] font-black text-white uppercase tracking-wider bg-stone-900 border border-stone-800 rounded-lg">
              ${d.dayLabel} • ${d.hour === 0 ? "12 AM" : d.hour === 12 ? "12 PM" : d.hour > 12 ? `${d.hour - 12} PM` : `${d.hour} AM`}
              <div class="text-[9px] font-bold text-teal-300 mt-0.5">Scans: ${d.count}</div>
            </div>
          `)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`);
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`);
      })
      .on("mouseout", function () {
        d3.select(this).style("stroke", "transparent");
        tooltip
          .transition()
          .duration(200)
          .style("opacity", 0);
      });

    // X Axis Labels (Hours)
    svg
      .append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(
        d3.axisBottom(xScale).tickFormat((h) => {
          if (h === 0) return "12a";
          if (h === 12) return "12p";
          if (h % 4 === 0) return h > 12 ? `${h - 12}p` : `${h}a`;
          return "";
        })
      )
      .selectAll("text")
      .style("font-size", "9px")
      .style("font-weight", "bold")
      .style("fill", "#78716c");

    // Y Axis Labels (Days)
    svg
      .append("g")
      .call(d3.axisLeft(yScale))
      .selectAll("text")
      .style("font-size", "9px")
      .style("font-weight", "bold")
      .style("fill", "#78716c");

    // Remove axis lines
    svg.selectAll(".domain, .tick line").remove();

    // Tooltip Element
    const tooltip = d3
      .select("body")
      .selectAll(".heatmap-tooltip")
      .data([0])
      .join("div")
      .attr("class", "heatmap-tooltip")
      .style("position", "absolute")
      .style("z-index", "100")
      .style("pointer-events", "none")
      .style("opacity", 0);

  }, [scans, loading]);

  return (
    <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs text-left space-y-4" ref={containerRef}>
      <div className="flex items-center justify-between border-b border-stone-100 pb-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={18} className="text-teal-600" />
          <div>
            <h3 className="text-xs font-black uppercase text-stone-900 tracking-wider">
              Visitor Traffic &amp; Scanning Heatmap
            </h3>
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
              D3-Powered Analysis of Peak Visitor activity (Hour vs Day)
            </span>
          </div>
        </div>
        {loading && <RefreshCw size={13} className="text-stone-400 animate-spin" />}
      </div>

      <div className="relative overflow-x-auto">
        <svg ref={svgRef} className="mx-auto" />
      </div>

      {/* Grid Color Legend */}
      <div className="flex items-center justify-between text-[9px] font-bold uppercase text-stone-400 tracking-wider font-mono bg-stone-50 border border-stone-150 rounded-xl p-2.5">
        <span>Quiet (0 Scans)</span>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-stone-100 border border-stone-200/50 inline-block" />
          <span className="w-2.5 h-2.5 rounded bg-teal-100 inline-block" />
          <span className="w-2.5 h-2.5 rounded bg-teal-300 inline-block" />
          <span className="w-2.5 h-2.5 rounded bg-teal-700 inline-block" />
        </div>
        <span>Peak Traffic</span>
      </div>
    </div>
  );
}
