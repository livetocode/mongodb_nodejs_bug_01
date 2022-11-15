import os
import time
import logging
import concurrent.futures
import jsonformatter
from datetime import datetime
from pymongo import MongoClient, monitoring
from prometheus_client import start_http_server, Histogram, Counter

LOG_AS_JSON = os.environ.get('LOG_AS_JSON', 'true') in ['true', 'T', '1', 'yes']
VERBOSE = os.environ.get('VERBOSE', 'false') in ['true', 'T', '1', 'yes']
LEVEL=logging.INFO
if VERBOSE:
    LEVEL=logging.DEBUG
STRING_FORMAT = '''{
    "level":       "levelname",
    "time":        "asctime",
    "message":     "message"
}'''
if LOG_AS_JSON:
    jsonformatter.basicConfig(level=LEVEL, format=STRING_FORMAT)
else:
    logging.basicConfig(
        format='%(asctime)s %(levelname)-8s %(message)s',
        level=LEVEL,
        datefmt='%Y-%m-%d %H:%M:%S')

RUNTIME = 'python'
DRIVER = 'pymongo'
DRIVER_VERSION = '4.3.2'
DRIVER_WITH_VERSION = "%s-%s" % (DRIVER, DRIVER_VERSION) 
COLLECTION_NAME = 'Samples'

# Create a metric to track time spent and requests made.
METRICS_PREFIX = "mongodb_client_test_"
REQUEST_TIME = Histogram(METRICS_PREFIX + 'task_duration', 'duration of the query', labelnames=['runtime', 'driver', 'driverVersion', 'driverWithVersion'], buckets= [0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 45, 60, 90, 120])
REQUEST_TIME_WITH_LABELS = REQUEST_TIME.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION)
TASK_COUNTER = Counter(METRICS_PREFIX + 'tasks_total', 'counters for tracking the number of queries', labelnames=['runtime', 'driver', 'driverVersion', 'driverWithVersion', 'result', 'title'])
MONGODB_EVENTS_COUNTER = Counter(METRICS_PREFIX + 'driver_events_total', 'counter for tracking MongoDB driver events', labelnames=['runtime', 'driver', 'driverVersion', 'driverWithVersion', 'eventName', 'value'])

def extractServerName(address):
    result = address
    if len(address) > 1:
        result = address[0]
    
    return str(result).split('.')[0]

class ServerLogger(monitoring.ServerListener):

    def opened(self, event):
        MONGODB_EVENTS_COUNTER.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION, eventName='serverOpening', value='').inc()
        name = extractServerName(event.server_address)
        logging.info("[EVENT] [serverOpened] [{1}] server added to topology {0.topology_id}".format(event, name))

    def description_changed(self, event):
        MONGODB_EVENTS_COUNTER.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION, eventName='serverDescriptionChanged', value='').inc()
        previous_server_type = event.previous_description.server_type
        new_server_type = event.new_description.server_type
        if new_server_type != previous_server_type:
            type_change = "{0.previous_description.server_type_name} --> {0.new_description.server_type_name}".format(event)
        else:
            type_change = event.new_description.server_type_name
        name = extractServerName(event.server_address)
        # server_type_name was added in PyMongo 3.4
        logging.info(
            "[EVENT] [serverDescriptionChanged] [{0}] {1}".format(name, type_change), extra = {"newEvent": event.new_description})

    def closed(self, event):
        MONGODB_EVENTS_COUNTER.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION, eventName='serverClosed', value='').inc()
        name = extractServerName(event.server_address)
        logging.warning("[EVENT] [serverClosed] [{0}] server removed from topology "
                        "{1.topology_id}".format(name, event))


class HeartbeatLogger(monitoring.ServerHeartbeatListener):

    def started(self, event):
        nodeName = extractServerName(event.connection_id)
        MONGODB_EVENTS_COUNTER.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION, 
            eventName='serverHeartbeatStarted', value=nodeName).inc()
        logging.debug("[EVENT] [heartbeatStarted] [{0}]".format(nodeName))

    def succeeded(self, event):
        nodeName = extractServerName(event.connection_id)
        MONGODB_EVENTS_COUNTER.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION, 
            eventName='serverHeartbeatSucceeded', value=nodeName).inc()
        # The reply.document attribute was added in PyMongo 3.4.
        logging.debug("[EVENT] [heartbeatSucceeded] [{1}]".format(event, nodeName))

    def failed(self, event):
        nodeName = extractServerName(event.connection_id)
        MONGODB_EVENTS_COUNTER.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION, 
            eventName='serverHeartbeatFailed', value=nodeName).inc()
        logging.error("[EVENT] [heartbeatFailed] [{1}] "
                        "failed with error: {0.reply}".format(event, nodeName))

class TopologyLogger(monitoring.TopologyListener):

    def opened(self, event):
        MONGODB_EVENTS_COUNTER.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION, 
            eventName='topologyOpening', value='').inc()
        logging.info("[EVENT] [topologyOpened] [{0.topology_id}]".format(event))

    def description_changed(self, event):
        # topology_type_name was added in PyMongo 3.4
        previous_topology_type = event.previous_description.topology_type_name
        new_topology_type = event.new_description.topology_type_name
        if new_topology_type != previous_topology_type:
            type_change = "%s --> %s" % (previous_topology_type, new_topology_type)
        else:
            type_change = new_topology_type
        logging.info("[EVENT] [topologyDescriptionChanged] [{0.topology_id}] {1}".format(event, type_change), extra = {"newEvent": event.new_description})
        # MONGODB_EVENTS_COUNTER.labels('topologyDescriptionChanged', event.new_description.topology_type_name).inc()
        MONGODB_EVENTS_COUNTER.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION, 
            eventName='topologyDescriptionChanged', value='').inc()

    def closed(self, event):
        MONGODB_EVENTS_COUNTER.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION, 
            eventName='topologyClosed', value='').inc()
        logging.info("[EVENT] [topologyClosed] [{0.topology_id}]".format(event))


url = os.environ.get('MONGO_URL')
if not url:
    raise Exception("Expected environment variable MONGO_URL to be defined")
logging.info('Starting pymongo with {0}'.format(url.split('@')[1].split('?')[0]))
client = MongoClient(url, event_listeners=[ServerLogger(), TopologyLogger(), HeartbeatLogger()])
db = client.get_default_database()
query_count = 0
query_error_count = 0

# Decorate function with metric.
@REQUEST_TIME_WITH_LABELS.time()
def execute_query():
    global query_count, query_error_count
    query_count += 1
    title = 'Get documents'
    try:
        docs = list(db[COLLECTION_NAME].find().limit(5))
        TASK_COUNTER.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION, 
            result='success', title=title).inc() 
        if VERBOSE: 
            if query_count % 10 == 0:
                logging.info("[TASK] [{0}] [Get documents] returned {1} documents".format(query_count, len(docs)))
    except Exception:
        query_error_count += 1
        logging.exception('MongoDB query failed')
        TASK_COUNTER.labels(runtime=RUNTIME, driver=DRIVER, driverVersion=DRIVER_VERSION, driverWithVersion=DRIVER_WITH_VERSION, 
            result='failure', title=title).inc() 

def ensureCollectionIsNotEmpty():
    names = db.list_collection_names()
    if not COLLECTION_NAME in names:
        logging.warning("The '%s' collection does not exist. Let's create a few documents." % COLLECTION_NAME)
        for i in range(5):
            db[COLLECTION_NAME].insert_one({
                "name": "Sample-%d" % i,
                "createdAt": datetime.utcnow()
            })


if __name__ == '__main__':
    ensureCollectionIsNotEmpty()
    # Start up the server to expose the metrics.
    start_http_server(3000)
    # Execute 2 tasks per second
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        while True:
            fs = [executor.submit(execute_query),
                  executor.submit(lambda: time.sleep(0.5))]
            concurrent.futures.wait(fs, timeout=None, return_when=concurrent.futures.ALL_COMPLETED)
