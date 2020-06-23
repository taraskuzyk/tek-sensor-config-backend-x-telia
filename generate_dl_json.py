import numpy as np
import pandas as pd
import json
from collections import OrderedDict

# To run, you will have to do "pip3 install numpy" and "pip3 install pandas"

def filter_nan(val):
    """Filters out NaNs cus they're stupid"""
    if (val is np.NaN) or (np.isnan(val)):
        return ""
    else:
        return val

def add_field_info(
    json_dict, category, group, field,
    header,
    data_size,
    bit_start,
    bit_end,
    datatype,
    round_val,
    multiplier):
    """Writes the field info into json_dict"""

    
    if (not pd.isnull(group)) and (group != "") and (group is not np.NaN):
        temp = {
            "data_size" : str(data_size),
            "bit_start" : str(bit_start),
            "bit_end" : str(bit_end),
            "type" : str(datatype),
            "round" : str(filter_nan(round_val)),
            "multiplier" : str(filter_nan(multiplier))
        }        
        json_dict[category][group]["header"] = str(header)
        json_dict[category][group][field] = temp
    
    else:
        temp = {
            "header" : str(header),
            "data_size" : str(data_size),
            "bit_start" : str(bit_start),
            "bit_end" : str(bit_end),
            "type" : str(datatype),
            "round" : str(filter_nan(round_val)),
            "multiplier" : str(filter_nan(multiplier))
        }        
        json_dict[category][field] = temp


# There's definitely a better way of doing this, but oh well


# Replace with your own directory
df = pd.read_csv("C:\\Users\\rmah\\VS-Code\\Encoder-Decoder-JSON-Generator\\DL\\resources\\homeSensor.csv")
# print(len(df))

json_dict = OrderedDict()

prev_cat = ""   # cat -> category
current_cat = df["category_name"][0]

if (not pd.isnull(current_cat)) and (current_cat != "") and (current_cat is not np.NaN):
    json_dict[current_cat] = OrderedDict()

for i in range(1, len(df)):
    prev_cat = current_cat
    current_cat = df["category_name"][i]

    if prev_cat != current_cat:
        json_dict[current_cat] = OrderedDict()

#################################################################################

prev_cat = ""
current_cat = df["category_name"][0]

prev_group = ""
current_group = df["group_name"][0]
if (not pd.isnull(current_group)) and (current_group != "") and (current_group is not np.NaN):
    json_dict[current_cat][current_group] = OrderedDict()

for i in range(1, len(df)):
    prev_cat = current_cat
    current_cat = df["category_name"][i]

    prev_group = current_group
    current_group = df["group_name"][i]

    if (prev_group != current_group) and (current_group is not np.NaN):
        json_dict[current_cat][current_group] = OrderedDict()

#################################################################################

prev_cat = ""
current_cat = df["category_name"][0]
prev_group = ""
current_group = df["group_name"][0]

for i in range(1, len(df)):
    prev_cat = current_cat
    current_cat = df["category_name"][i]
    prev_group = current_group
    current_group = df["group_name"][i]

    header = df["header"][i]
    data_size = df["data_size"][i]
    bit_start = df["bit_start"][i]
    bit_end = df["bit_end"][i]
    datatype = df["type"][i]
    round_val = df["round"][i]
    multiplier = df["multiplier"][i]

    add_field_info(
        json_dict, current_cat, current_group, df["parameter_name"][i],
        header,
        data_size,
        bit_start,
        bit_end,
        datatype,
        round_val,
        multiplier)
    
# Replace with your appropriate directory
with open("C:\\Users\\rmah\\VS-Code\\Encoder-Decoder-JSON-Generator\\DL\\downlinkHomeSensor.json", "w") as f:
    json.dump(json_dict, f, indent = 4)


# print(json.dumps(json_dict, indent = 4))


        
