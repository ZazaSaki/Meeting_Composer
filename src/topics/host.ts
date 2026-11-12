// What the Topics views need from the plugin. Implemented in main.ts.

import { App } from "obsidian";
import { TopicIndex } from "./TopicIndex";
import { TopicQuery } from "./types";

export const VIEW_TYPE_TOPICS = "meeting-composer-topics";
export const VIEW_TYPE_RESULTS = "meeting-composer-results";

export interface TopicsHost {
	app: App;
	index: TopicIndex;
	/** Show results in the Results tab (reused if open); `newTab` forces a separate tab. */
	showResults(q: TopicQuery, newTab?: boolean): Promise<void>;
	autoCompleteEnabled(): boolean;
	minutesDir(): string;
}
