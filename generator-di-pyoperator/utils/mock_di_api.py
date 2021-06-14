#
# SPDX-FileCopyrightText: 2021 Thorsten Hapke <thorsten.hapke@sap.com>
#
# SPDX-License-Identifier: Apache-2.0
#

import os
import json
import logging

class mock_config:
    def __init__(self, attributes):
        for k, v in attributes.items():
            setattr(self, k, v)

class mock_logger :

    def info(self,msg_str):
        logging.info(msg_str)
    def debug(self,msg_str):
        logging.debug(msg_str)
    def warning(self,msg_str):
        logging.warning(msg_str)
    def error(self,msg_str):
        logging.error(msg_str)
    def addHandler(self,handler):
        logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
        logger = logging.getLogger(name="operator")
        logger.addHandler(handler)


class mock_api:

    print_send_msg = True
    msg_list = list()
    config = mock_config

    def __init__(self,source_path):
        op_dir = os.path.dirname(source_path)
        with open(os.path.join(op_dir,'operator.json')) as json_file:
            config_data = json.load(json_file)['config']
        del config_data['$type']
        config = mock_config(config_data)
        self.logger = mock_logger()

    class Message:
        def __init__(self, body=None, attributes=""):
            self.body = body
            self.attributes = attributes

    def send(self,port,msg):
        mock_api.msg_list.append({'port':port,'data':msg})
        if mock_api.print_send_msg :
            if isinstance(msg,str) :
                print('PORT {}: {}'.format(port,msg))
            else :
                print('PORT {}: \nattributes: {}\nbody: {}'.format(port,str(msg.attributes),str(msg.body)))

    def set_port_callback(self,*args):
        pass
    def add_generator(self,*args):
        pass
    def add_timer(self,*args):
        pass
    def add_shutdown_handler(self,*args):
        pass



