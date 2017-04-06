/*
 * Generate a svg timeline with javascript.
 * Based on https://github.com/jasonreisman/Timeline written in python.
 * Slightly documented: https://github.com/linkviii/Timeline
 *
 * Usage: `new Timeline(tlData, "timelineID").build();`
 *
 * v 2017-2-4
 *   (Try to change with new features. Not strict.)
 * 
 * MIT licenced
 */


/// <reference path="../lib/svgjs.d.ts"/>
import * as SVG from "../lib/svgjs";

//Util
function max<T>(x: T, y: T, fn: (val: T) => number): T {
    if (fn(x) > fn(y)) {
        return x;
    } else {
        return y;
    }
}

//

export const Colors: { black: string, gray: string } = {black: '#000000', gray: '#C0C0C0'};

//

/*
 * Interfaces of controlling json
 * start/end YYYY-MM-DD (currently `new Date(str);`)
 * V2 is prefered
 */

export type TimelineData = TimelineDataV1 | TimelineDataV2;

//v1
export type TimelineCalloutV1 = [string, string] | [string, string, string];
export type TimelineEraV1 = [string, string, string] | [string, string, string, string];
export interface TimelineDataV1 {
    width: number;
    start: string;
    end: string;
    num_ticks?: number;
    tick_format?: string;
    //[[description, date, ?color],...]
    callouts?: TimelineCalloutV1[];
    //[[name, startDate, endDate, ?color],...]
    eras?: TimelineEraV1[];
}

//v2
export interface TimelineCalloutV2 {
    description: string;
    date: string;
    color?: string;
}

export interface TimelineEraV2 {
    name: string;
    startDate: string;
    endDate: string;
    color?: string;
}

export interface TimelineDataV2 {
    apiVersion: 2;
    width: number;
    startDate: string;
    endDate: string;
    numTicks?: number;
    tickFormat?: string;
    callouts?: TimelineCalloutV2[];
    eras?: TimelineEraV2[];
}

export class TimelineConverter {
    public static convertCallouts(oldCallouts: TimelineCalloutV1[]): TimelineCalloutV2[] {
        const callouts: TimelineCalloutV2[] = [];

        for (let oldCallout of oldCallouts) {
            const newCallout: TimelineCalloutV2 = {
                description: oldCallout[0],
                date: oldCallout[1]
            };
            if (oldCallout.length == 3) {
                newCallout.color = oldCallout[2]
            }
            callouts.push(newCallout);
        }
        return callouts;
    }

    public static convertEras(oldEras: TimelineEraV1[]): TimelineEraV2[] {
        const eras: TimelineEraV2[] = [];
        for (let oldEra of oldEras) {
            const newEra: TimelineEraV2 = {
                name: oldEra[0],
                startDate: oldEra[1],
                endDate: oldEra[2]
            };
            if (oldEra.length == 4) {
                newEra.color = oldEra[3];
            }
            eras.push(newEra);
        }
        return eras;
    }

    static convertTimelineDataV1ToV2(oldData: TimelineDataV1): TimelineDataV2 {

        const newData: TimelineDataV2 = {
            apiVersion: 2,
            width: oldData.width,
            startDate: oldData.start,
            endDate: oldData.end
        };

        // camelCase names
        if ('num_ticks' in oldData) {
            newData.numTicks = oldData.num_ticks;
        }
        if ('tick_format' in oldData) {
            newData.tickFormat = oldData.tick_format;
        }

        // Convert tuples to objects
        if ('callouts' in oldData) {
            newData.callouts = TimelineConverter.convertCallouts(oldData.callouts);
        }
        if ('eras' in oldData) {
            newData.eras = TimelineConverter.convertEras(oldData.eras);
        }

        return newData;
    }
}


/**
 * addAxisLabel kw
 */
interface LabelKW {
    tick?: boolean;
    stroke?: string;
    fill?: string;
}


//
//
//

type Info = [string, string];// event, color

export class Timeline {


    public static readonly calloutProperties: { width: number, height: number, increment: number } = {
        width: 10,
        height: 15,
        increment: 10
    };
    public static readonly textFudge: [number, number] = [3, 1.5]; //factor? [?, ?]


    public readonly data: TimelineDataV2;

    public readonly startDate: Date;
    public readonly endDate: Date;

    public readonly date0: number;
    public readonly date1: number;
    public readonly totalSeconds: number;


    public readonly tickFormat: string;
    public readonly markers;

    public maxLabelHeight: number;

    public readonly width: number;

    public readonly drawing;
    public readonly axisGroup;

    // initializes data for timeline
    constructor(data: TimelineData, id: string) {

        if ((<TimelineDataV2>data).apiVersion == 2) {
            this.data = <TimelineDataV2>data;
        } else {
            this.data = TimelineConverter.convertTimelineDataV1ToV2(<TimelineDataV1>data);

        }


        this.width = this.data.width;

        this.drawing = SVG(id);
        this.axisGroup = this.drawing.group();

        this.startDate = new Date(this.data.startDate);
        this.endDate = new Date(this.data.endDate);

        const delta: number = (this.endDate.valueOf() - this.startDate.valueOf());
        const padding: number = (new Date(delta * 0.1)).valueOf();

        this.date0 = this.startDate.valueOf() - padding;
        this.date1 = this.endDate.valueOf() + padding;
        this.totalSeconds = (this.date1 - this.date0) / 1000;


        // TODO use
        this.tickFormat = this.data.tickFormat;

        this.markers = {};


        //# maxLabelHeight stores the max height of all axis labels
        //# and is used in the final height computation in build(self)
        this.maxLabelHeight = 0;
    }

    // Generates svg document
    public  build(): void {
        //# MAGIC NUMBER: y_era
        //# draw era label and markers at this height
        const yEra: number = 10;

        //# create main axis and callouts,
        //# keeping track of how high the callouts are
        this.createMainAxis();
        const yCallouts = this.createCallouts();

        //# determine axis position so that axis + callouts don't overlap with eras
        const yAxis: number = yEra + Timeline.calloutProperties.height - yCallouts;

        //# determine height so that eras, callouts, axis, and labels just fit
        const height: number = yAxis + this.maxLabelHeight + 4 * Timeline.textFudge[1];

        //# create eras and labels using axis height and overall height
        this.createEras(yEra, yAxis, height);
        this.createEraAxisLabels();

        //# translate the axis group and add it to the drawing
        this.axisGroup.translate(0, yAxis);
        this.drawing.add(this.axisGroup);

        this.drawing.size(this.width, height);

    }


    private createEras(yEra: number, yAxis: number, height: number): void {
        if (!('eras' in this.data)) {
            return;
        }

        //# create eras
        let erasData: TimelineEraV2[] = this.data.eras;
        //let markers = {};

        for (let era of erasData) {
            //# extract era data

            const name: string = era.name;

            const t0: number = (new Date(era.startDate)).valueOf();
            const t1: number = (new Date(era.endDate)).valueOf();

            const fill: string = era.color || Colors.gray;


            const [startMarker, endMarker] = this.getMarkers(fill);


            //# create boundary lines
            const percentWidth0: number = (t0 - this.date0) / 1000 / this.totalSeconds;
            const percentWidth1: number = (t1 - this.date0) / 1000 / this.totalSeconds;

            const x0: number = Math.trunc(percentWidth0 * this.width + 0.5);
            const x1: number = Math.trunc(percentWidth1 * this.width + 0.5);


            const rect = this.drawing.rect(x1 - x0, height);
            rect.x(x0);
            rect.fill({color: fill, opacity: 0.15});

            this.drawing.add(rect);

            const line0 = this.drawing.add(
                this.drawing.line(x0, 0, x0, yAxis)
                    .stroke({color: fill, width: 0.5})
            );

            //TODO line0 line1 dash
            //http://svgwrite.readthedocs.io/en/latest/classes/mixins.html#svgwrite.mixins.Presentation.dasharray
            //line0.dasharray([5, 5])
            //what the svgjs equiv?

            const line1 = this.drawing.add(
                this.drawing.line(x1, 0, x1, yAxis)
                    .stroke({color: fill, width: 0.5})
            );
            //line1.dasharray([5, 5])


            //# create horizontal arrows and text
            const horz = this.drawing.add(
                this.drawing.line(x0, yEra, x1, yEra)
                    .stroke({color: fill, width: 0.75})
            );

            //TODO markers?
            /*
             horz['marker-start'] = start_marker.get_funciri()
             horz['marker-end'] = end_marker.get_funciri()
             self.drawing.add(self.drawing.text(name, insert=(0.5*(x0 + x1), y_era - self.textFudge[1]), stroke='none',
             ````fill=fill, font_family="Helevetica", font_size="6pt", text_anchor="middle"))
             */
            const txt = this.drawing.text(name);
            txt.font({family: 'Helevetica', size: '6pt', anchor: 'middle'});
            txt.dx(0.5 * (x0 + x1)).dy(yEra - Timeline.textFudge[1] - 9);
            txt.fill(fill);

            this.drawing.add(txt);
        }//end era loop
    }

    /**
     * @param {String} color
     * @return {Array<marker, marker>}
     */
    private  getMarkers(color: string): [any, any] {

        let startMarker;
        let endMarker;

        if (color in this.markers) {
            [startMarker, endMarker] = this.markers[color];
        } else {
            startMarker = this.drawing.marker(10, 10, function (add) {
                add.path("M6,0 L6,7 L0,3 L6,0").fill(color)
            }).ref(0, 3);

            endMarker = this.drawing.marker(10, 10, function (add) {
                add.path("M0,0 L0,7 L6,3 L0,0").fill(color)
            }).ref(6, 3);

            this.markers[color] = [startMarker, endMarker]
        }

        return [startMarker, endMarker]
    };


    private  createMainAxis() {
        //# draw main line
        this.axisGroup.add(this.drawing.line(0, 0, this.width, 0)
            .stroke({color: Colors.black, width: 3}));

        //# add tickmarks
        //self.addAxisLabel(self.startDate, str(self.startDate[0]), tick=True)
        this.addAxisLabel(this.startDate, this.startDate.toDateString(), {tick: true});
        this.addAxisLabel(this.endDate, this.endDate.toDateString(), {tick: true});

        if ('numTicks' in this.data) {
            const delta = this.endDate.valueOf() - this.startDate.valueOf();
            //let secs = delta / 1000
            const numTicks = this.data.numTicks;
            //needs more?
            for (let j = 1; j < numTicks; j++) {
                const tickDelta = /*new Date*/(j * delta / numTicks);
                const tickmarkDate = new Date(this.startDate.valueOf() + tickDelta);
                this.addAxisLabel(tickmarkDate, tickmarkDate.toDateString())
            }
        }
    }


    private createEraAxisLabels(): void {
        if (!('eras' in this.data)) {
            return;
        }

        const erasData: TimelineEraV2[] = this.data.eras;

        for (let era of erasData) {
            let t0 = new Date(era.startDate);
            let t1 = new Date(era.endDate);
            this.addAxisLabel(t0, t0.toDateString());
            this.addAxisLabel(t1, t1.toDateString());
        }
    }


    //def addAxisLabel(self, dt, label, **kwargs):
    private addAxisLabel(dt: Date, label: string, kw?: LabelKW) {
        //date, string?
        kw = kw || {};

        if (this.tickFormat) {
            //##label = dt[0].strftime(self.tickFormat)
            // label = dt
            //TODO tick format
        }
        const percentWidth: number = (dt.valueOf() - this.date0) / 1000 / this.totalSeconds;
        if (percentWidth < 0 || percentWidth > 1) {
            //error? Log?
            console.log(dt);
            return;
        }

        const x: number = Math.trunc(percentWidth * this.width + 0.5);
        const dy: number = 5;

        // # add tick on line
        const addTick: boolean = kw.tick || true;
        if (addTick) {
            const stroke: string = kw.stroke || Colors.black;
            const line = this.drawing.line(x, -dy, x, dy)
                .stroke({color: stroke, width: 2});

            this.axisGroup.add(line);
        }

        // # add label
        const fill: string = kw.fill || Colors.gray;


        /*
         #self.drawing.text(label, insert=(x, -2 * dy), stroke='none', fill=fill, font_family='Helevetica',
         ##font_size='6pt', text_anchor='end', writing_mode='tb', transform=transform))
         */
        //writing mode?

        const txt = this.drawing.text(label);
        txt.font({family: 'Helevetica', size: '6pt', anchor: 'end'});
        txt.transform({rotation: 270, cx: x, cy: 0});
        txt.dx(x - 7).dy((-2 * dy) + 5);

        txt.fill(fill);

        this.axisGroup.add(txt);

        const h = Timeline.getTextWidth('Helevetica', 6, label) + 2 * dy;
        this.maxLabelHeight = Math.max(this.maxLabelHeight, h);

    }

    //

    //pure fn
    //sub fn createCallouts()
    private static sortCallouts(calloutsData: TimelineCalloutV2[]): [number[], Map<number, Info[]>] {

        const sortedDates: number[] = [];
        const eventsByDate: Map<number, Info[]> = new Map();
        for (let callout of calloutsData) {

            const tmp: string = callout.date;
            const eventDate: number = (new Date(tmp)).valueOf();

            const event: string = callout.description;
            const eventColor: string = callout.color || Colors.black;

            sortedDates.push(eventDate);
            if (!( eventsByDate.has(eventDate))) {
                eventsByDate.set(eventDate, []);// [event_date] = []
            }
            const newInfo: Info = [event, eventColor];
            const events: Array<Info> = eventsByDate.get(eventDate);
            events.push(newInfo);

        }
        sortedDates.sort();

        return [sortedDates, eventsByDate];
    }

    /**
     *
     * @param str
     * @returns {any}
     */
    private static bifercateString(str: string): [string, string] | null {
        const cuttingRangeStart = Math.floor(str.length * 0.33);
        const cuttingRangeEnd = str.length * 0.66;

        //TODO better
        let maxCutPoint = 0;
        for (let i = cuttingRangeStart; i < cuttingRangeEnd; i++) {
            if (str[i] == " ") {
                maxCutPoint = i;
            }
        }
        if (maxCutPoint != 0) {
            return [str.slice(0, maxCutPoint), str.slice(maxCutPoint + 1, str.length)];
        } else {
            return null;
        }

    }


    //pure fn
    private static calculateCalloutLevel(leftBoundary: number, prevEndpoints: number[], prevLevels: number[]): number {

        let i: number = prevEndpoints.length - 1;
        let level: number = 0;


        // Given previous endpoints within the span of event's bounds,
        // find the highest level needed to not overlap,
        // starting with the closest endpoints.
        //~`for i = prevEndpoints.length - 1; i--`
        //left boundary < a prev endpoint → intersection
        //    → higher level needed than the level of intersected endpoint
        while (leftBoundary < prevEndpoints[i] && i >= 0) {
            level = Math.max(level, prevLevels[i] + 1);
            i -= 1;
        }

        return level;
    }

    private static calculateEventLeftBondary(event: string, eventEndpoint: number): number {
        const textWidth: number = Timeline.getTextWidth('Helevetica', 6, event);
        //const leftBoundary: number =
        return eventEndpoint - (textWidth + Timeline.calloutProperties.width + Timeline.textFudge[0]);
    }

    //not pure fn
    //sub fn createCallouts()
    //modifies prev*
    private static calculateCalloutHeight(eventEndpoint: number, prevEndpoints: number[], prevLevels: number[], event: string): [number, string] {


        //ensure text does not overlap with previous entries

        const leftBoundary: number = Timeline.calculateEventLeftBondary(event, eventEndpoint);

        let level: number = Timeline.calculateCalloutLevel(leftBoundary, prevEndpoints, prevLevels);


        const bif = Timeline.bifercateString(event);
        if (bif) {

            //longest of 2 stings
            const bifEvent: string = max(bif[0], bif[1], function (val) {
                return val.length;
            });
            const bifBondary: number = Timeline.calculateEventLeftBondary(bifEvent, eventEndpoint);
            // occupying 2 lines → +1
            const bifLevel: number = Timeline.calculateCalloutLevel(bifBondary, prevEndpoints, prevLevels) + 1;
            //compare levels somehow

            if (bifLevel < level) {
                level = bifLevel;
                event = bif.join("\n")
            }
        }


        const calloutHeight = level * Timeline.calloutProperties.increment;

        prevEndpoints.push(eventEndpoint);
        prevLevels.push(level);

        return [calloutHeight, event];
    }

    //

    /**
     *
     * @returns {number} min_y ?
     */
    private  createCallouts(): number {
        if (!('callouts' in this.data)) {
            return;//undefined
        }
        //type Info = [string, string];// event, color

        //# sort callouts
        const [sortedDates, eventsByDate]:
            [number[], Map<number, Info[]>] = Timeline.sortCallouts(this.data.callouts);

        //# add callouts, one by one, making sure they don't overlap
        let prevX: number[] = [-Infinity];
        let prevLevel: number[] = [-1];
        //vertical drawing up is negative ~= max height
        let minY = Infinity;

        // for each callout
        for (let eventDate of sortedDates) {

            const [rawEvent, eventColor]:Info = eventsByDate.get(eventDate).pop();


            const numSeconds: number = (eventDate - this.date0) / 1000;
            const percentWidth: number = numSeconds / this.totalSeconds;
            if (percentWidth < 0 || percentWidth > 1) {
                const w: string = ["Skipped callout: ", rawEvent, ". percentWidth: ", percentWidth,
                    ". Date not in range?"].join("");
                console.warn(w);
                continue;
            }


            // positioning
            const x: number = Math.trunc(percentWidth * this.width + 0.5);
            //# figure out what 'level" to make the callout on
            const [calloutHeight, event]: [number, string] = Timeline.calculateCalloutHeight(x, prevX, prevLevel, rawEvent);
            const y: number = 0 - Timeline.calloutProperties.height - calloutHeight;
            minY = Math.min(minY, y);

            //svg elements
            const pathData: string = ['M', x, ',', 0, ' L', x, ',', y, ' L',
                (x - Timeline.calloutProperties.width), ',', y].join("");
            const pth = this.drawing.path(pathData).stroke({color: eventColor, width: 1, fill:"none"});
            pth.fill("none", 0);

            this.axisGroup.add(pth);

            const txt = this.drawing.text(event);
            txt.dx(x - Timeline.calloutProperties.width - Timeline.textFudge[0]);
            txt.dy(y - 4 * Timeline.textFudge[1]);
            txt.font({family: 'Helevetica', size: '6pt', anchor: 'end'});
            txt.fill(eventColor);

            this.axisGroup.add(txt);

            const eDate: Date = new Date(eventDate);
            this.addAxisLabel(eDate, eDate.toLocaleString(),
                {tick: false, fill: Colors.black});

            //XXX white is transparent?
            const circ = this.drawing.circle(8).attr({fill: 'white', cx: x, cy: 0, stroke: eventColor});

            this.axisGroup.add(circ);

        }

        return minY;

    }

    private static readonly canvas = document.createElement('canvas');

    private static getTextWidth(family: string, size: number, text: string): number {
        //use canvas to measure text width

        const ctx = Timeline.canvas.getContext("2d");
        ctx.font = size + "pt " + family;
        const w = ctx.measureText(text).width;

        return w;
    }


}





