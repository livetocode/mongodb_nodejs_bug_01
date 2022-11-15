"use strict";
 /**
 * A watch that can measure elapsed time using high-resolution real time
 */
class Stopwatch {
    /**
     * creates a new watch and start it
     */
    static startNew() {
        const watch = new Stopwatch();
        watch.start();
        return watch;
    }
    /** tells if the watch is started */
    isStarted() {
        return !!this.hrstart;
    }
    /** tells if the watch is stopped */
    isStopped() {
        return !!this.hrend;
    }
    /**
     * Starts the watch.
     * @throws Error if the watch is already started
     */
    start() {
        if (this.isStarted()) {
            // tslint:disable-next-line: quotemark
            throw new Error("You can't start an already started watch!");
        }
        this.hrstart = process.hrtime.bigint();
        this.hrend = undefined;
    }
    /**
     * Stops the watch.
     * @throws Error if the watch has not been started
     */
    stop() {
        if (!this.isStarted()) {
            throw new Error('You must start the watch before calling this method');
        }
        this.hrend = process.hrtime.bigint();
    }
    /** resets the watch */
    reset() {
        this.hrstart = undefined;
        this.hrend = undefined;
    }
    /** resets the watch and start it again */
    restart() {
        this.reset();
        this.start();
    }
    /**
     * gets the elapsed time in nano seconds since the start
     * @throws Error if the watch has not been started
     */
    elapsedTimeInNanos() {
        if (this.hrstart) {
            let { hrend } = this;
            if (!hrend) {
                hrend = process.hrtime.bigint();
            }
            return hrend - this.hrstart;
        }
        throw new Error('You must start the watch to obtain elapsed time');
    }
    /**
     * gets the elapsed time in milli seconds since the start
     * @throws Error if the watch has not been started
     */
    elapsedTimeInMS() {
        return Number(this.elapsedTimeInNanos() / BigInt(1000000));
    }
    /** gets a string representation of the watch's state */
    toString() {
        if (this.isStopped()) {
            return `Watch stopped after ${this.elapsedTimeInMS()} ms`;
        }
        if (this.isStarted()) {
            return `Watch still running after ${this.elapsedTimeInMS()} ms`;
        }
        return 'Watch is empty';
    }
}
module.exports = Stopwatch;
