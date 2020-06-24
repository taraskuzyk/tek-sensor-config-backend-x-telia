import numpy as np
import pandas as pd
import json
from collections import OrderedDict

# To run, you will have to do "pip3 install numpy" and "pip3 install pandas"

def filter_nan(val):
    if (val is np.NaN) or (np.isnan(val)):
        return ""
    else:
        return val

def add_field_info(
    json_dict, category, group, field,
    port,
    header,
    data_size,
    bit_start,
    bit_end,
    datatype,
    multiplier):
    """Writes the field info into json_dict"""

    
    if (not pd.isnull(group)) and (group != "") and (group is not np.NaN):
        temp = {
            "data_size" : str(data_size),
            "bit_start" : str(bit_start),
            "bit_end" : str(bit_end),
            "type" : str(datatype),
            "multiplier" : str(filter_nan(multiplier))
        }        
        json_dict[category][group]["port"] = str(port)
        json_dict[category][group]["header"] = str(header)
        json_dict[category][group][field] = temp
    
    else:
        temp = {
            "port" : str(port),
            "header" : str(header),
            "data_size" : str(data_size),
            "bit_start" : str(bit_start),
            "bit_end" : str(bit_end),
            "type" : str(datatype),
            "multiplier" : str(filter_nan(multiplier))
        }        
        json_dict[category][field] = temp


# There's definitely a better way of doing this, but oh well

#################################################################################################################################
# Replace with the appropriate directories:
csv_path = r"C:\Users\rmah\VS-Code\Encoder-Decoder-JSON-Generator\DL\resources\HomeSensorFieldsDL.csv"
json_path = r"C:\Users\rmah\VS-Code\Encoder-Decoder-JSON-Generator\DL\downlinkHomeSensor.json"
#################################################################################################################################


df = pd.read_csv(csv_path)
json_dict = OrderedDict()

prev_cat = ""   # cat -> category
current_cat = df["Category name"][0]

if (not pd.isnull(current_cat)) and (current_cat != "") and (current_cat is not np.NaN):
    json_dict[current_cat] = OrderedDict()

for i in range(1, len(df)):
    prev_cat = current_cat
    current_cat = df["Category name"][i]

    if prev_cat != current_cat:
        json_dict[current_cat] = OrderedDict()

#################################################################################

prev_cat = ""
current_cat = df["Category name"][0]

prev_group = ""
current_group = df["Group name"][0]
if (not pd.isnull(current_group)) and (current_group != "") and (current_group is not np.NaN):
    json_dict[current_cat][current_group] = OrderedDict()

for i in range(1, len(df)):
    prev_cat = current_cat
    current_cat = df["Category name"][i]

    prev_group = current_group
    current_group = df["Group name"][i]

    if (prev_group != current_group) and (current_group is not np.NaN):
        json_dict[current_cat][current_group] = OrderedDict()

#################################################################################

prev_cat = ""
current_cat = df["Category name"][0]
prev_group = ""
current_group = df["Group name"][0]

port = df["Port"][0]
header = df["Header"][0]
data_size = df["Data size"][0]
bit_start = df["Bit start"][0]
bit_end = df["Bit end"][0]
datatype = df["Type"][0]
multiplier = df["Multiplier"][0]
add_field_info(
    json_dict, current_cat, current_group, df["Field name"][0],
    port,
    header,
    data_size,
    bit_start,
    bit_end,
    datatype,
    multiplier)

for i in range(1, len(df)):
    prev_cat = current_cat
    current_cat = df["Category name"][i]
    prev_group = current_group
    current_group = df["Group name"][i]

    port = df["Port"][i]
    header = df["Header"][i]
    data_size = df["Data size"][i]
    bit_start = df["Bit start"][i]
    bit_end = df["Bit end"][i]
    datatype = df["Type"][i]
    multiplier = df["Multiplier"][i]

    add_field_info(
        json_dict, current_cat, current_group, df["Field name"][i],
        port,
        header,
        data_size,
        bit_start,
        bit_end,
        datatype,
        multiplier)

with open(json_path, "w") as f:
    json.dump(json_dict, f, indent = 4)


# print(json.dumps(json_dict, indent = 4))


        
